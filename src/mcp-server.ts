#!/usr/bin/env bun
/**
 * UberSearch MCP Server
 *
 * Exposes ubersearch functionality as an MCP (Model Context Protocol) server
 * for use with Claude Desktop and other MCP-compatible tools.
 */

import { bootstrapContainer, getCreditStatus, uberSearch } from "./app/index";
import type { ProviderRegistry } from "./core/provider";
import { ServiceKeys } from "./core/serviceKeys";
import { isLifecycleProvider } from "./plugin/types.js";

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
  id?: number | string;
  result?: unknown;
  error?: {
    code?: number;
    message: string;
  };
}

interface HealthResult {
  engineId: string;
  status: "healthy" | "unhealthy" | "skipped";
  message?: string;
}

// Helper function with timeout
async function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`${operation} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]);
}

// MCP Server entry point for Claude Desktop
export async function serve() {
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
      console.log(JSON.stringify(response));
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
      console.log(JSON.stringify(response));
      continue;
    }

    if (request.method === "tools/call") {
      const params = request.params ?? {};
      const name = String(params.name ?? "");
      const args =
        typeof params.arguments === "object" && params.arguments !== null
          ? (params.arguments as Record<string, string>)
          : ({} as Record<string, string>);

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
          const container = await withTimeout(bootstrapContainer(), 30000, "bootstrapContainer");
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
                  message: error instanceof Error ? error.message : String(error),
                });
              }
            } else {
              results.push({ engineId: provider.id, status: "skipped" });
            }
          }
          result = results;
        } else {
          throw new Error(`Unknown tool: ${name}`);
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
        console.log(JSON.stringify(response));
      } catch (error) {
        const errorResponse: MCPResponse = {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        };
        console.log(JSON.stringify(errorResponse));
      }
    }
  }
}

// Auto-start if run directly
if (import.meta.main) {
  serve();
}
