/**
 * Comprehensive MCP Server Tests
 *
 * Tests for src/mcp-server.ts covering JSON-RPC protocol compliance,
 * tool listing, tool calling, error handling, and edge cases.
 *
 * Strategy: Spawns the MCP server as a child process and communicates
 * via stdin/stdout pipes, testing the real protocol behavior.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type ChildProcess, spawn } from "node:child_process";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id?: number | string | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Manages an MCP server child process for testing.
 * Sends JSON-RPC requests over stdin and collects responses from stdout.
 */
class MCPTestHarness {
  private proc: ChildProcess | null = null;
  private responseBuffer: string = "";
  private responses: JsonRpcResponse[] = [];
  private waiters: Array<(resp: JsonRpcResponse) => void> = [];

  async start(): Promise<void> {
    this.proc = spawn("bun", ["run", "src/mcp-server.ts"], {
      cwd: "/Volumes/Storage/code/ubersearch",
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        // Provide fake API keys so bootstrap does not fail
        TAVILY_API_KEY: "test-tavily-key",
        BRAVE_API_KEY: "test-brave-key",
        SEARXNG_API_KEY: "test-searxng-key",
        LINKUP_API_KEY: "test-linkup-key",
        SKIP_DOCKER_TESTS: "true",
        DISABLE_RETRY: "true",
      },
    });

    this.proc.stdout?.on("data", (chunk: Buffer) => {
      this.responseBuffer += chunk.toString();
      const lines = this.responseBuffer.split("\n");
      // Keep the last (potentially incomplete) line in the buffer
      this.responseBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim() === "") {
          continue;
        }
        try {
          const parsed = JSON.parse(line) as JsonRpcResponse;
          // If someone is waiting for a response, give it to them
          const waiter = this.waiters.shift();
          if (waiter) {
            waiter(parsed);
          } else {
            this.responses.push(parsed);
          }
        } catch {
          // Ignore non-JSON output (e.g. debug logs)
        }
      }
    });

    // Give the process a moment to spin up
    await sleep(300);
  }

  /**
   * Send a JSON-RPC request and wait for a response.
   */
  async send(request: JsonRpcRequest, timeoutMs = 5000): Promise<JsonRpcResponse> {
    if (!this.proc?.stdin) {
      throw new Error("MCP server process not started");
    }

    // Check if we already have a buffered response (unlikely but safe)
    const buffered = this.responses.shift();
    if (buffered) {
      return buffered;
    }

    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(`Timed out waiting for response to method=${request.method} id=${request.id}`),
        );
      }, timeoutMs);

      this.waiters.push((resp) => {
        clearTimeout(timer);
        resolve(resp);
      });

      this.proc?.stdin?.write(`${JSON.stringify(request)}\n`);
    });
  }

  /**
   * Send raw text (e.g. malformed JSON) over stdin and wait for a response.
   */
  async sendRaw(text: string, timeoutMs = 5000): Promise<JsonRpcResponse> {
    if (!this.proc?.stdin) {
      throw new Error("MCP server process not started");
    }

    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for response to raw input`));
      }, timeoutMs);

      this.waiters.push((resp) => {
        clearTimeout(timer);
        resolve(resp);
      });

      this.proc?.stdin?.write(`${text}\n`);
    });
  }

  /**
   * Send a notification (no id, no response expected). Waits briefly for any
   * potential unexpected response.
   */
  async sendNotification(
    request: Omit<JsonRpcRequest, "id">,
    waitMs = 300,
  ): Promise<JsonRpcResponse | null> {
    if (!this.proc?.stdin) {
      throw new Error("MCP server process not started");
    }

    const countBefore = this.responses.length;
    this.proc.stdin.write(`${JSON.stringify(request)}\n`);
    await sleep(waitMs);

    // If a response arrived unexpectedly, return it
    if (this.responses.length > countBefore) {
      return this.responses.shift() ?? null;
    }
    return null;
  }

  async stop(): Promise<void> {
    if (this.proc) {
      this.proc.kill("SIGTERM");
      // Wait for process to exit
      await new Promise<void>((resolve) => {
        this.proc?.on("exit", () => resolve());
        setTimeout(resolve, 1000);
      });
      this.proc = null;
    }
    this.responses = [];
    this.waiters = [];
    this.responseBuffer = "";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const SKIP_MCP_TESTS = process.env.CI === "true" || process.env.SKIP_MCP_TESTS === "true";

describe.skipIf(SKIP_MCP_TESTS)("MCP Server", () => {
  let harness: MCPTestHarness;

  beforeEach(async () => {
    harness = new MCPTestHarness();
    await harness.start();
  });

  afterEach(async () => {
    await harness.stop();
  });

  // =========================================================================
  // 1. JSON-RPC Protocol Compliance
  // =========================================================================

  describe("JSON-RPC Protocol Compliance", () => {
    test("responses include jsonrpc 2.0 field", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      });

      expect(resp.jsonrpc).toBe("2.0");
    });

    test("responses echo the request id (numeric)", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 42,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      });

      expect(resp.id).toBe(42);
    });

    test("responses echo the request id (string)", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: "request-abc-123",
        method: "tools/list",
      });

      expect(resp.id).toBe("request-abc-123");
    });

    test("error responses include numeric code field", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 99,
        method: "nonexistent/method",
      });

      expect(resp.error).toBeDefined();
      expect(typeof resp.error?.code).toBe("number");
      expect(typeof resp.error?.message).toBe("string");
    });

    test("error responses still include jsonrpc 2.0", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 100,
        method: "nonexistent/method",
      });

      expect(resp.jsonrpc).toBe("2.0");
    });

    test("error responses echo the request id", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 777,
        method: "unknown/thing",
      });

      expect(resp.id).toBe(777);
    });
  });

  // =========================================================================
  // 2. Initialize Method
  // =========================================================================

  describe("Initialize Method", () => {
    test("returns serverInfo with name and version", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      });

      expect(resp.result).toBeDefined();
      const result = resp.result as Record<string, unknown>;
      const serverInfo = result.serverInfo as Record<string, string>;
      expect(serverInfo.name).toBe("ubersearch");
      expect(serverInfo.version).toBe("1.0.0");
    });

    test("returns protocol version", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      });

      const result = resp.result as Record<string, unknown>;
      expect(result.protocolVersion).toBe("2024-11-05");
    });

    test("returns capabilities with tools", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      });

      const result = resp.result as Record<string, unknown>;
      const capabilities = result.capabilities as Record<string, unknown>;
      expect(capabilities.tools).toBeDefined();
    });

    test("does not return an error", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
      });

      expect(resp.error).toBeUndefined();
      expect(resp.result).toBeDefined();
    });
  });

  // =========================================================================
  // 3. Initialized Notification
  // =========================================================================

  describe("Initialized Notification", () => {
    test("notifications/initialized produces no response", async () => {
      const resp = await harness.sendNotification({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      });

      // Notifications should not produce a response
      expect(resp).toBeNull();
    });

    test("initialized (legacy) produces no response", async () => {
      const resp = await harness.sendNotification({
        jsonrpc: "2.0",
        method: "initialized",
      });

      expect(resp).toBeNull();
    });
  });

  // =========================================================================
  // 4. Tools List
  // =========================================================================

  describe("Tools List", () => {
    test("returns all three tools", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      });

      expect(resp.result).toBeDefined();
      const result = resp.result as { tools: Array<{ name: string }> };
      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames).toContain("uber_search");
      expect(toolNames).toContain("uber_search_credits");
      expect(toolNames).toContain("uber_search_health");
      expect(result.tools).toHaveLength(3);
    });

    test("each tool has name, description, and inputSchema", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      });

      const result = resp.result as {
        tools: Array<{
          name: string;
          description: string;
          inputSchema: Record<string, unknown>;
        }>;
      };

      for (const tool of result.tools) {
        expect(typeof tool.name).toBe("string");
        expect(tool.name.length).toBeGreaterThan(0);
        expect(typeof tool.description).toBe("string");
        expect(tool.description.length).toBeGreaterThan(0);
        expect(typeof tool.inputSchema).toBe("object");
        expect(tool.inputSchema).not.toBeNull();
      }
    });

    test("uber_search tool requires query parameter", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/list",
      });

      const result = resp.result as {
        tools: Array<{
          name: string;
          inputSchema: { required?: string[]; properties?: Record<string, unknown> };
        }>;
      };
      const searchTool = result.tools.find((t) => t.name === "uber_search");

      expect(searchTool).toBeDefined();
      expect(searchTool?.inputSchema.required).toContain("query");
    });

    test("uber_search tool schema includes all expected properties", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/list",
      });

      const result = resp.result as {
        tools: Array<{
          name: string;
          inputSchema: { properties?: Record<string, unknown> };
        }>;
      };
      const searchTool = result.tools.find((t) => t.name === "uber_search");
      const props = searchTool?.inputSchema.properties ?? {};

      expect(props.query).toBeDefined();
      expect(props.engines).toBeDefined();
      expect(props.strategy).toBeDefined();
      expect(props.limit).toBeDefined();
      expect(props.categories).toBeDefined();
    });

    test("uber_search_credits and uber_search_health have no required params", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/list",
      });

      const result = resp.result as {
        tools: Array<{
          name: string;
          inputSchema: { required?: string[] };
        }>;
      };

      const creditsTool = result.tools.find((t) => t.name === "uber_search_credits");
      const healthTool = result.tools.find((t) => t.name === "uber_search_health");

      expect(creditsTool?.inputSchema.required).toEqual([]);
      expect(healthTool?.inputSchema.required).toEqual([]);
    });
  });

  // =========================================================================
  // 5. Tools Call - uber_search
  // =========================================================================

  describe("Tools Call - uber_search", () => {
    test("missing query returns error with code -32602", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 10,
        method: "tools/call",
        params: {
          name: "uber_search",
          arguments: {},
        },
      });

      expect(resp.error).toBeDefined();
      expect(resp.error?.code).toBe(-32602);
      expect(resp.error?.message).toContain("query");
    });

    test("empty string query returns error with code -32602", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 11,
        method: "tools/call",
        params: {
          name: "uber_search",
          arguments: { query: "" },
        },
      });

      expect(resp.error).toBeDefined();
      expect(resp.error?.code).toBe(-32602);
      expect(resp.error?.message).toContain("query");
    });

    test("whitespace-only query returns error with code -32602", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 12,
        method: "tools/call",
        params: {
          name: "uber_search",
          arguments: { query: "   " },
        },
      });

      expect(resp.error).toBeDefined();
      expect(resp.error?.code).toBe(-32602);
      expect(resp.error?.message).toContain("query");
    });

    test("query exceeding 2000 chars returns error with code -32602", async () => {
      const longQuery = "a".repeat(2001);
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 13,
        method: "tools/call",
        params: {
          name: "uber_search",
          arguments: { query: longQuery },
        },
      });

      expect(resp.error).toBeDefined();
      expect(resp.error?.code).toBe(-32602);
      expect(resp.error?.message).toContain("2000");
    });

    test("query at exactly 2000 chars does not trigger length error", async () => {
      const exactQuery = "a".repeat(2000);
      const resp = await harness.send(
        {
          jsonrpc: "2.0",
          id: 14,
          method: "tools/call",
          params: {
            name: "uber_search",
            arguments: { query: exactQuery },
          },
        },
        15000,
      );

      // Should not be a -32602 length error. It may succeed or fail with
      // a different error (e.g. -32603 internal if API keys are invalid),
      // but not a param validation error about length.
      if (resp.error) {
        expect(resp.error.code).not.toBe(-32602);
      }
    });

    test("missing arguments object still triggers query validation", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 15,
        method: "tools/call",
        params: {
          name: "uber_search",
          // no arguments key at all
        },
      });

      expect(resp.error).toBeDefined();
      expect(resp.error?.code).toBe(-32602);
    });

    test("valid search request returns result with content array", async () => {
      // This test may get an internal error because real API keys are not
      // available, but the response structure should still be valid JSON-RPC.
      const resp = await harness.send(
        {
          jsonrpc: "2.0",
          id: 16,
          method: "tools/call",
          params: {
            name: "uber_search",
            arguments: { query: "bun test" },
          },
        },
        15000,
      );

      expect(resp.jsonrpc).toBe("2.0");
      expect(resp.id).toBe(16);

      // Either a successful result with content or an internal error
      if (resp.result) {
        const result = resp.result as { content: Array<{ type: string; text: string }> };
        expect(result.content).toBeDefined();
        expect(Array.isArray(result.content)).toBe(true);
        expect(result.content.length).toBeGreaterThan(0);
        expect(result.content[0]?.type).toBe("text");
        expect(typeof result.content[0]?.text).toBe("string");
      } else {
        // Internal error is acceptable (no real API keys)
        expect(resp.error).toBeDefined();
        expect(resp.error?.code).toBe(-32603);
      }
    });
  });

  // =========================================================================
  // 6. Tools Call - uber_search_credits
  // =========================================================================

  describe("Tools Call - uber_search_credits", () => {
    test("returns a valid JSON-RPC response", async () => {
      const resp = await harness.send(
        {
          jsonrpc: "2.0",
          id: 20,
          method: "tools/call",
          params: {
            name: "uber_search_credits",
            arguments: {},
          },
        },
        10000,
      );

      expect(resp.jsonrpc).toBe("2.0");
      expect(resp.id).toBe(20);

      // Either a result or an internal error, but structurally valid
      if (resp.result) {
        const result = resp.result as { content: Array<{ type: string; text: string }> };
        expect(result.content).toBeDefined();
        expect(result.content[0]?.type).toBe("text");
      } else {
        expect(resp.error).toBeDefined();
        expect(typeof resp.error?.code).toBe("number");
      }
    });
  });

  // =========================================================================
  // 7. Tools Call - uber_search_health
  // =========================================================================

  describe("Tools Call - uber_search_health", () => {
    test("returns a valid JSON-RPC response", async () => {
      const resp = await harness.send(
        {
          jsonrpc: "2.0",
          id: 30,
          method: "tools/call",
          params: {
            name: "uber_search_health",
            arguments: {},
          },
        },
        15000,
      );

      expect(resp.jsonrpc).toBe("2.0");
      expect(resp.id).toBe(30);

      if (resp.result) {
        const result = resp.result as { content: Array<{ type: string; text: string }> };
        expect(result.content).toBeDefined();
        const firstContent = result.content[0];
        expect(firstContent).toBeDefined();
        expect(firstContent?.type).toBe("text");
        // The text should be valid JSON (array of health results)
        const healthResults = JSON.parse(firstContent?.text ?? "[]");
        expect(Array.isArray(healthResults)).toBe(true);
      } else {
        expect(resp.error).toBeDefined();
        expect(typeof resp.error?.code).toBe("number");
      }
    });
  });

  // =========================================================================
  // 8. Tools Call - Unknown Tool
  // =========================================================================

  describe("Tools Call - Unknown Tool", () => {
    test("unknown tool name returns error with code -32602", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 40,
        method: "tools/call",
        params: {
          name: "nonexistent_tool",
          arguments: {},
        },
      });

      expect(resp.error).toBeDefined();
      expect(resp.error?.code).toBe(-32602);
      expect(resp.error?.message).toContain("nonexistent_tool");
    });

    test("empty tool name returns error", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 41,
        method: "tools/call",
        params: {
          name: "",
          arguments: {},
        },
      });

      expect(resp.error).toBeDefined();
      expect(resp.error?.code).toBe(-32602);
    });

    test("missing name field in tools/call returns error", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 42,
        method: "tools/call",
        params: {
          arguments: { query: "test" },
        },
      });

      expect(resp.error).toBeDefined();
      expect(resp.error?.code).toBe(-32602);
    });

    test("tool name with typo returns error", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 43,
        method: "tools/call",
        params: {
          name: "uber_serach", // typo
          arguments: { query: "test" },
        },
      });

      expect(resp.error).toBeDefined();
      expect(resp.error?.code).toBe(-32602);
      expect(resp.error?.message).toContain("uber_serach");
    });
  });

  // =========================================================================
  // 9. Method Not Found
  // =========================================================================

  describe("Method Not Found", () => {
    test("unknown method returns error with code -32601", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 50,
        method: "unknown/method",
      });

      expect(resp.error).toBeDefined();
      expect(resp.error?.code).toBe(-32601);
      expect(resp.error?.message).toContain("Method not found");
    });

    test("error message includes the unknown method name", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 51,
        method: "resources/list",
      });

      expect(resp.error).toBeDefined();
      expect(resp.error?.code).toBe(-32601);
      expect(resp.error?.message).toContain("resources/list");
    });

    test("empty method string returns method-not-found", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 52,
        method: "",
      });

      // Empty method should be treated as unknown
      expect(resp.error).toBeDefined();
      expect(resp.error?.code).toBe(-32601);
    });

    test("unknown method without id (notification) produces no response", async () => {
      // Per JSON-RPC spec, notifications (no id) should not produce responses
      const resp = await harness.sendNotification({
        jsonrpc: "2.0",
        method: "unknown/notification",
      });

      // The server should not send a response for notifications without id
      expect(resp).toBeNull();
    });
  });

  // =========================================================================
  // 10. Parse Error
  // =========================================================================

  describe("Parse Error", () => {
    test("malformed JSON returns parse error with code -32700", async () => {
      const resp = await harness.sendRaw("{not valid json}");

      expect(resp.jsonrpc).toBe("2.0");
      expect(resp.id).toBeNull();
      expect(resp.error).toBeDefined();
      expect(resp.error?.code).toBe(-32700);
      expect(resp.error?.message).toContain("Parse error");
    });

    test("empty object is valid JSON and not a parse error", async () => {
      // {} is valid JSON so it should not trigger -32700.
      // However, it has no `id`, so the server treats it as a notification
      // to an unknown method and silently drops it (no response).
      const resp = await harness.sendNotification({
        jsonrpc: "2.0",
        method: "", // effectively what {} looks like with undefined method
      } as Omit<JsonRpcRequest, "id">);

      // No response expected for a notification
      expect(resp).toBeNull();
    });

    test("truncated JSON returns parse error", async () => {
      const resp = await harness.sendRaw('{"jsonrpc": "2.0", "id": 1, "method":');

      expect(resp.error).toBeDefined();
      expect(resp.error?.code).toBe(-32700);
    });

    test("plain text returns parse error", async () => {
      const resp = await harness.sendRaw("hello world");

      expect(resp.error).toBeDefined();
      expect(resp.error?.code).toBe(-32700);
    });

    test("parse error response has null id", async () => {
      const resp = await harness.sendRaw("!!!invalid!!!");

      expect(resp.id).toBeNull();
    });

    test("server continues processing after parse error", async () => {
      // Send malformed JSON first
      await harness.sendRaw("not json");

      // Then send a valid request - server should still work
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 60,
        method: "tools/list",
      });

      expect(resp.id).toBe(60);
      expect(resp.result).toBeDefined();
      expect(resp.error).toBeUndefined();
    });
  });

  // =========================================================================
  // 11. Sequential Request Handling
  // =========================================================================

  describe("Sequential Request Handling", () => {
    test("can handle multiple requests in sequence", async () => {
      // Request 1: initialize
      const resp1 = await harness.send({
        jsonrpc: "2.0",
        id: 70,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      });
      expect(resp1.id).toBe(70);
      expect(resp1.result).toBeDefined();

      // Request 2: tools/list
      const resp2 = await harness.send({
        jsonrpc: "2.0",
        id: 71,
        method: "tools/list",
      });
      expect(resp2.id).toBe(71);
      expect(resp2.result).toBeDefined();

      // Request 3: error case
      const resp3 = await harness.send({
        jsonrpc: "2.0",
        id: 72,
        method: "tools/call",
        params: {
          name: "uber_search",
          arguments: {},
        },
      });
      expect(resp3.id).toBe(72);
      expect(resp3.error).toBeDefined();
    });

    test("request ids are echoed correctly across multiple requests", async () => {
      const ids = [1, 2, 3, "alpha", "beta", 999];

      for (const id of ids) {
        const resp = await harness.send({
          jsonrpc: "2.0",
          id,
          method: "tools/list",
        });
        expect(resp.id).toBe(id);
      }
    });
  });

  // =========================================================================
  // 12. Edge Cases
  // =========================================================================

  describe("Edge Cases", () => {
    test("tools/call with no params object still works", async () => {
      // params is undefined - the server defaults to {}
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 80,
        method: "tools/call",
      });

      // Should get an error about unknown tool (name would be "")
      expect(resp.error).toBeDefined();
      expect(resp.error?.code).toBe(-32602);
    });

    test("tools/call with non-object arguments is handled", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 81,
        method: "tools/call",
        params: {
          name: "uber_search",
          arguments: "not-an-object",
        },
      });

      // Should either reject the invalid arguments or treat as empty
      expect(resp.error).toBeDefined();
    });

    test("tools/call with null arguments is handled", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 82,
        method: "tools/call",
        params: {
          name: "uber_search",
          arguments: null,
        },
      });

      // null arguments should be treated as empty, triggering query validation
      expect(resp.error).toBeDefined();
      expect(resp.error?.code).toBe(-32602);
    });

    test("initialize can be called multiple times", async () => {
      const resp1 = await harness.send({
        jsonrpc: "2.0",
        id: 83,
        method: "initialize",
      });
      expect(resp1.result).toBeDefined();

      const resp2 = await harness.send({
        jsonrpc: "2.0",
        id: 84,
        method: "initialize",
      });
      expect(resp2.result).toBeDefined();

      // Both should return the same structure
      const r1 = resp1.result as Record<string, unknown>;
      const r2 = resp2.result as Record<string, unknown>;
      expect((r1.serverInfo as Record<string, string>).name).toBe(
        (r2.serverInfo as Record<string, string>).name,
      );
    });

    test("tools/list can be called before initialize", async () => {
      // MCP spec says initialize must come first, but server should
      // still handle this gracefully rather than crash
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 85,
        method: "tools/list",
      });

      // Should still return tools (or a graceful error)
      expect(resp.jsonrpc).toBe("2.0");
      expect(resp.id).toBe(85);
    });

    test("request with id=0 is handled correctly", async () => {
      const resp = await harness.send({
        jsonrpc: "2.0",
        id: 0,
        method: "tools/list",
      });

      // id=0 is valid in JSON-RPC
      expect(resp.id).toBe(0);
      expect(resp.result).toBeDefined();
    });

    test("recovery after internal error: server continues", async () => {
      // Force an internal error with a valid tool but missing query
      const errResp = await harness.send({
        jsonrpc: "2.0",
        id: 86,
        method: "tools/call",
        params: {
          name: "uber_search",
          arguments: {},
        },
      });
      expect(errResp.error).toBeDefined();

      // Server should still be alive and responsive
      const okResp = await harness.send({
        jsonrpc: "2.0",
        id: 87,
        method: "tools/list",
      });
      expect(okResp.result).toBeDefined();
      expect(okResp.id).toBe(87);
    });
  });
});
