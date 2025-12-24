#!/usr/bin/env bun
/**
 * Multi-Search MCP Server
 *
 * Exposes multi-search functionality as an MCP (Model Context Protocol) server
 * for use with Claude Desktop and other MCP-compatible tools.
 */

import { bootstrapContainer, getCreditStatus, multiSearch } from "./src/app/index";
import { isLifecycleProvider } from "./src/bootstrap/container";
import type { ProviderRegistry } from "./src/core/provider";
import { ServiceKeys } from "./src/core/serviceKeys";

interface MCPRequest {
  jsonrpc: string;
  id?: number | string;
  method: string;
  params?: any;
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

interface MCPToolCallParams {
  name: string;
  arguments: Record<string, any>;
}

interface MCPResponse {
  jsonrpc: string;
  id?: number | string;
  result?: any;
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
      name: "multi_search",
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
        },
        required: ["query"],
      },
    },
    {
      name: "multi_search_credits",
      description: "Show credit status for all configured search engines",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "multi_search_health",
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
            name: "multi-search",
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
      const { name, arguments: args } = request.params as MCPToolCallParams;

      try {
        let result: any;
        if (name === "multi_search") {
          const engines = args.engines
            ? args.engines.split(",").map((e: string) => e.trim())
            : undefined;
          result = await withTimeout(
            multiSearch({
              query: args.query,
              limit: args.limit,
              engines,
              strategy: args.strategy,
            }),
            60000,
            "multiSearch",
          );
        } else if (name === "multi_search_credits") {
          result = await withTimeout(getCreditStatus(), 10000, "getCreditStatus");
        } else if (name === "multi_search_health") {
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
