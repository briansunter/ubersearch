/**
 * MCP server bootstrap.
 *
 * Owns the DI container and runs the MCP protocol via
 * `@modelcontextprotocol/sdk` over stdio. The container is created lazily on
 * first tool call and reused for every subsequent call within the process
 * lifetime.
 *
 * See ADR-0001 for the rationale behind using the official SDK.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import pkg from "../../package.json" with { type: "json" };
import { bootstrapContainer } from "../bootstrap/container";
import type { Container } from "../core/container";
import type { ProviderRegistry } from "../core/provider";
import { ServiceKeys } from "../core/serviceKeys";
import { isLifecycleProvider } from "../plugin/types";
import { findTool, tools } from "./registry";

const SERVER_NAME = "ubersearch";
const BOOTSTRAP_TIMEOUT_MS = 30_000;

async function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${operation} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function registerShutdown(getContainer: () => Container | null): void {
  const shutdown = async () => {
    try {
      const container = getContainer();
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

export function createServer(getContainer: () => Promise<Container>): Server {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: pkg.version,
    },
    {
      capabilities: { tools: {} },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;

    const tool = findTool(name);
    if (!tool) {
      throw new McpError(ErrorCode.InvalidParams, `Unknown tool: '${name}'`);
    }

    try {
      const container = await getContainer();
      const result = await tool.handler(args, container);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("Invalid params:")) {
        throw new McpError(ErrorCode.InvalidParams, message);
      }
      throw new McpError(ErrorCode.InternalError, message);
    }
  });

  return server;
}

export async function serve(): Promise<void> {
  let container: Container | null = null;
  registerShutdown(() => container);

  const ensureContainer = async (): Promise<Container> => {
    if (!container) {
      container = await withTimeout(
        bootstrapContainer(),
        BOOTSTRAP_TIMEOUT_MS,
        "bootstrapContainer",
      );
    }
    return container;
  };

  const server = createServer(ensureContainer);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Keep the event loop alive until the transport closes. Without this, a
  // `bun build --compile` binary exits as soon as connect() resolves because
  // the SDK's stdin listener alone is not enough to keep the loop running in
  // compiled mode.
  await new Promise<void>((resolve) => {
    transport.onclose = () => resolve();
  });
}
