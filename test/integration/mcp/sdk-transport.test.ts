/**
 * In-process integration test for the SDK-backed MCP server.
 *
 * Uses `InMemoryTransport.createLinkedPair()` to wire a `Client` and our
 * `Server` together without spawning a child process or touching stdio. This
 * is the canary that catches "the handlers work in isolation but the SDK glue
 * is wrong" without paying the cost of a child-process spawn per test.
 */

import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Container } from "../../../src/core/container";
import { ProviderRegistry } from "../../../src/core/provider";
import { ServiceKeys } from "../../../src/core/serviceKeys";
import { createServer } from "../../../src/mcp/bootstrap";

function makeFakeContainer(): Container {
  const container = new Container();

  // Fake orchestrator — handleUberSearch reaches for ORCHESTRATOR via the
  // underlying uberSearch() function with a containerOverride.
  container.singleton(ServiceKeys.ORCHESTRATOR, () => ({
    run: async (query: string) => ({
      query,
      results: [
        {
          title: "Example",
          url: "https://example.com",
          snippet: "An example result",
          score: 0.9,
          sourceEngine: "tavily",
        },
      ],
      engineAttempts: [{ engineId: "tavily", success: true }],
      credits: [],
    }),
  }));

  // Fake credit manager for handleCredits + the saveState() call inside
  // the orchestrator helper path.
  container.singleton(ServiceKeys.CREDIT_MANAGER, () => ({
    listSnapshots: () => [{ engineId: "tavily", remaining: 100, used: 0 }],
    saveState: async () => {},
  }));

  // Fake provider registry for handleHealth.
  container.singleton(ServiceKeys.PROVIDER_REGISTRY, () => new ProviderRegistry());

  return container;
}

async function connect(): Promise<{ client: Client; close: () => Promise<void> }> {
  const fakeContainer = makeFakeContainer();
  const server = createServer(async () => fakeContainer);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe("SDK-backed MCP server (in-memory transport)", () => {
  test("tools/list returns the three documented tools", async () => {
    const { client, close } = await connect();
    try {
      const result = await client.listTools();
      const names = result.tools.map((t) => t.name).sort();
      expect(names).toEqual(["uber_search", "uber_search_credits", "uber_search_health"]);
    } finally {
      await close();
    }
  });

  test("tools/list exposes the documented uber_search input schema", async () => {
    const { client, close } = await connect();
    try {
      const result = await client.listTools();
      const search = result.tools.find((t) => t.name === "uber_search");
      expect(search).toBeDefined();
      expect(search?.inputSchema).toMatchObject({
        type: "object",
        required: ["query"],
      });
      const props = (search?.inputSchema as { properties: Record<string, unknown> }).properties;
      expect(Object.keys(props).sort()).toEqual([
        "categories",
        "engines",
        "limit",
        "query",
        "strategy",
      ]);
    } finally {
      await close();
    }
  });

  test("tools/call uber_search returns a content envelope with stringified JSON", async () => {
    const { client, close } = await connect();
    try {
      const result = await client.callTool({
        name: "uber_search",
        arguments: { query: "react hooks" },
      });
      expect(result.content).toBeArrayOfSize(1);
      const first = (result.content as Array<{ type: string; text: string }>)[0];
      expect(first?.type).toBe("text");
      const parsed = JSON.parse(first?.text ?? "");
      expect(parsed.items).toBeArrayOfSize(1);
      expect(parsed.items[0].url).toBe("https://example.com");
    } finally {
      await close();
    }
  });

  test("tools/call uber_search_credits delegates to the CreditManager", async () => {
    const { client, close } = await connect();
    try {
      const result = await client.callTool({
        name: "uber_search_credits",
        arguments: {},
      });
      const text = (result.content as Array<{ text: string }>)[0]?.text ?? "";
      const parsed = JSON.parse(text);
      expect(parsed).toEqual([{ engineId: "tavily", remaining: 100, used: 0 }]);
    } finally {
      await close();
    }
  });

  test("tools/call uber_search_health returns an empty array when no providers are registered", async () => {
    const { client, close } = await connect();
    try {
      const result = await client.callTool({
        name: "uber_search_health",
        arguments: {},
      });
      const text = (result.content as Array<{ text: string }>)[0]?.text ?? "";
      expect(JSON.parse(text)).toEqual([]);
    } finally {
      await close();
    }
  });

  test("tools/call rejects an empty query as InvalidParams", async () => {
    const { client, close } = await connect();
    try {
      await expect(
        client.callTool({
          name: "uber_search",
          arguments: { query: "" },
        }),
      ).rejects.toMatchObject({ code: -32602 });
    } finally {
      await close();
    }
  });

  test("tools/call rejects an unknown tool as InvalidParams", async () => {
    const { client, close } = await connect();
    try {
      await expect(
        client.callTool({
          name: "uber_search_unknown",
          arguments: {},
        }),
      ).rejects.toMatchObject({ code: -32602 });
    } finally {
      await close();
    }
  });

  test("initialize handshake reports ubersearch as the server name", async () => {
    const { client, close } = await connect();
    try {
      const info = client.getServerVersion();
      expect(info?.name).toBe("ubersearch");
      expect(typeof info?.version).toBe("string");
    } finally {
      await close();
    }
  });
});
