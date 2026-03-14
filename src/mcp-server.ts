#!/usr/bin/env bun
/**
 * UberSearch MCP Server
 *
 * Exposes ubersearch functionality as an MCP (Model Context Protocol) server
 * for use with Claude Desktop and other MCP-compatible tools.
 */

import { bootstrapContainer, getCreditStatus, uberSearch } from "./app/index";
import { getErrorMessage } from "./core/errorUtils";
import type { ProviderRegistry } from "./core/provider";
import { ServiceKeys } from "./core/serviceKeys";
import { isLifecycleProvider } from "./plugin/types";

interface MCPRequest {
  jsonrpc: string;
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: string;
  id?: number | string | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

interface HealthResult {
  engineId: string;
  status: "healthy" | "unhealthy" | "skipped";
  message?: string;
}

// Module-level container reference for shutdown handlers
let globalContainer: Awaited<ReturnType<typeof bootstrapContainer>> | null = null;

// Helper function with timeout
async function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`${operation} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]);
}

function setupShutdownHandlers() {
  const shutdown = async () => {
    try {
      const container = globalContainer;
      if (container) {
        const registry = container.get<ProviderRegistry>(ServiceKeys.PROVIDER_REGISTRY);
        if (registry) {
          for (const provider of registry.list()) {
            if (isLifecycleProvider(provider) && typeof provider.shutdown === "function") {
              try {
                await provider.shutdown();
              } catch {
                // Best-effort shutdown
              }
            }
          }
        }
      }
    } catch {
      // Best-effort cleanup
    }
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

// MCP Server entry point for Claude Desktop
export async function serve() {
  setupShutdownHandlers();
  const tools: MCPTool[] = [
    {
      name: "uber_search",
      description: "Unified search across multiple providers (Tavily, Brave, Linkup, SearXNG)",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
          engines: {
            type: "string",
            description: "Comma-separated list of engines to use (e.g., 'tavily,brave')",
            default: "",
          },
          strategy: {
            type: "string",
            enum: ["all", "first-success"],
            description: "Search strategy: 'all' (query all) or 'first-success' (stop after first)",
            default: "all",
          },
          limit: {
            type: "number",
            description: "Maximum results per engine",
            default: 10,
          },
          categories: {
            type: "string",
            description: `SearXNG categories (comma-separated). Available categories:
- general: Web search (brave, duckduckgo, startpage, qwant)
- it: Tech (github, stackoverflow, npm, pypi, huggingface)
- science: Academic (arxiv, google_scholar)
- news: News (hackernews, reddit, bbc)
- videos: Video (youtube)
Example: "it,science" for tech and academic results`,
            default: "",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "uber_search_credits",
      description: "Show credit status for all configured search engines",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "uber_search_health",
      description: "Run health checks on all configured search providers",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  ];

  // Handle MCP tool calls via stdin/stdout
  const validToolNames = new Set(tools.map((t) => t.name));

  const readline = (await import("node:readline")).createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  for await (const line of readline) {
    let request: MCPRequest;
    try {
      request = JSON.parse(line);
    } catch {
      const errorResponse: MCPResponse = {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: "Parse error: invalid JSON",
        },
      };
      process.stdout.write(`${JSON.stringify(errorResponse)}\n`);
      continue;
    }

    // Handle initialize request - required by MCP protocol
    if (request.method === "initialize") {
      const response: MCPResponse = {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: "ubersearch",
            version: "1.0.0",
          },
        },
      };
      process.stdout.write(`${JSON.stringify(response)}\n`);
      continue;
    }

    // Handle initialized notification (no response needed)
    if (request.method === "notifications/initialized" || request.method === "initialized") {
      continue;
    }

    if (request.method === "tools/list") {
      const response: MCPResponse = {
        jsonrpc: "2.0",
        id: request.id,
        result: { tools },
      };
      process.stdout.write(`${JSON.stringify(response)}\n`);
      continue;
    }

    if (request.method === "tools/call") {
      const params = request.params ?? {};
      const name = String(params.name ?? "");
      const args =
        typeof params.arguments === "object" && params.arguments !== null
          ? (params.arguments as Record<string, string>)
          : ({} as Record<string, string>);

      // Validate tool name
      if (!validToolNames.has(name)) {
        const response: MCPResponse = {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32602,
            message: `Unknown tool: '${name}'`,
          },
        };
        process.stdout.write(`${JSON.stringify(response)}\n`);
        continue;
      }

      // Validate required query parameter for uber_search
      if (name === "uber_search" && (!args.query || args.query.trim() === "")) {
        const response: MCPResponse = {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32602,
            message: "Invalid params: 'query' is required and must be non-empty",
          },
        };
        process.stdout.write(`${JSON.stringify(response)}\n`);
        continue;
      }

      // Input sanitization - query length check
      if (args.query && args.query.length > 2000) {
        const response: MCPResponse = {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32602,
            message: "Invalid params: query exceeds maximum length of 2000 characters",
          },
        };
        process.stdout.write(`${JSON.stringify(response)}\n`);
        continue;
      }

      try {
        let result: unknown;
        if (name === "uber_search") {
          const engines = args.engines ? args.engines.split(",").map((e) => e.trim()) : undefined;
          const categories = args.categories
            ? args.categories.split(",").map((c) => c.trim())
            : undefined;
          result = await withTimeout(
            uberSearch({
              query: args.query ?? "",
              limit: args.limit ? Number(args.limit) : undefined,
              engines,
              strategy:
                args.strategy === "all" || args.strategy === "first-success"
                  ? args.strategy
                  : undefined,
              categories,
            }),
            60000,
            "uberSearch",
          );
        } else if (name === "uber_search_credits") {
          result = await withTimeout(getCreditStatus(), 10000, "getCreditStatus");
        } else if (name === "uber_search_health") {
          if (!globalContainer) {
            globalContainer = await withTimeout(bootstrapContainer(), 30000, "bootstrapContainer");
          }
          const container = globalContainer;
          const registry = container.get<ProviderRegistry>(ServiceKeys.PROVIDER_REGISTRY);
          const providers = registry.list();

          const results: HealthResult[] = [];
          for (const provider of providers) {
            if (isLifecycleProvider(provider)) {
              try {
                await withTimeout(provider.healthcheck(), 5000, `healthcheck ${provider.id}`);
                results.push({ engineId: provider.id, status: "healthy" });
              } catch (error) {
                results.push({
                  engineId: provider.id,
                  status: "unhealthy",
                  message: getErrorMessage(error),
                });
              }
            } else {
              results.push({ engineId: provider.id, status: "skipped" });
            }
          }
          result = results;
        }

        const response: MCPResponse = {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          },
        };
        process.stdout.write(`${JSON.stringify(response)}\n`);
      } catch (error) {
        const errorResponse: MCPResponse = {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : String(error),
          },
        };
        process.stdout.write(`${JSON.stringify(errorResponse)}\n`);
      }
    } else if (request.id !== undefined) {
      // Unknown method - send error response (only for requests with id, not notifications)
      const response: MCPResponse = {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32601,
          message: `Method not found: ${request.method}`,
        },
      };
      process.stdout.write(`${JSON.stringify(response)}\n`);
    }
  }
}

// Auto-start if run directly
if (import.meta.main) {
  serve();
}
