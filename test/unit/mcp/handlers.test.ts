import { describe, expect, test } from "bun:test";
import { Container } from "../../../src/core/container";
import type { ILifecycleProvider, SearchProvider } from "../../../src/core/provider";
import { ProviderRegistry } from "../../../src/core/provider";
import { ServiceKeys } from "../../../src/core/serviceKeys";
import { handleCredits, handleHealth, handleUberSearch } from "../../../src/mcp/handlers";

// ---------------------------------------------------------------------------
// Helpers — minimal fakes for the services the handlers reach for.
// ---------------------------------------------------------------------------

interface FakeOrchestratorCall {
  query: string;
  options: Record<string, unknown>;
}

function makeContainerWithFakeOrchestrator(
  calls: FakeOrchestratorCall[],
  result: unknown = {
    query: "ignored",
    results: [],
    engineAttempts: [],
    credits: [],
  },
): Container {
  const container = new Container();
  container.singleton(ServiceKeys.ORCHESTRATOR, () => ({
    run: async (query: string, options: Record<string, unknown>) => {
      calls.push({ query, options });
      return result;
    },
  }));
  return container;
}

function makeContainerWithFakeCreditManager(snapshot: unknown): Container {
  const container = new Container();
  container.singleton(ServiceKeys.CREDIT_MANAGER, () => ({
    listSnapshots: () => snapshot,
  }));
  return container;
}

class StubSearchProvider implements SearchProvider {
  readonly id: string;
  constructor(id: string) {
    this.id = id;
  }
  async search(): Promise<never> {
    throw new Error("search not used in these tests");
  }
}

class StubLifecycleProvider implements SearchProvider, ILifecycleProvider {
  readonly id: string;
  private healthy: boolean;
  constructor(id: string, opts: { healthy: boolean }) {
    this.id = id;
    this.healthy = opts.healthy;
  }
  async search(): Promise<never> {
    throw new Error("search not used in these tests");
  }
  async init(): Promise<void> {}
  async healthcheck(): Promise<boolean> {
    if (!this.healthy) {
      throw new Error(`${this.id} is down`);
    }
    return true;
  }
  async shutdown(): Promise<void> {}
}

// ---------------------------------------------------------------------------
// handleUberSearch
// ---------------------------------------------------------------------------

describe("handleUberSearch", () => {
  test("forwards query and parsed options to the orchestrator", async () => {
    const calls: FakeOrchestratorCall[] = [];
    const container = makeContainerWithFakeOrchestrator(calls);

    await handleUberSearch(
      {
        query: "react hooks",
        engines: ["tavily", "brave"],
        strategy: "all",
        limit: 5,
        categories: ["it", "general"],
      },
      container,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.query).toBe("react hooks");
    expect(calls[0]?.options.limit).toBe(5);
    expect(calls[0]?.options.strategy).toBe("all");
    expect(calls[0]?.options.engineOrderOverride).toEqual(["tavily", "brave"]);
    expect(calls[0]?.options.categories).toEqual(["it", "general"]);
  });

  test("works with only the required query argument", async () => {
    const calls: FakeOrchestratorCall[] = [];
    const container = makeContainerWithFakeOrchestrator(calls);

    await handleUberSearch({ query: "minimal" }, container);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.query).toBe("minimal");
  });

  test("returns the formatted UberSearchOutput shape", async () => {
    const container = makeContainerWithFakeOrchestrator([], {
      query: "ignored",
      results: [
        {
          title: "Example",
          url: "https://example.com",
          snippet: "An example",
          score: 0.9,
          sourceEngine: "tavily",
        },
      ],
      engineAttempts: [{ engineId: "tavily", success: true }],
      credits: [],
    });

    const result = (await handleUberSearch({ query: "anything" }, container)) as {
      items: unknown[];
      enginesTried: unknown[];
    };

    expect(result.items).toHaveLength(1);
    expect(result.enginesTried).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// handleCredits
// ---------------------------------------------------------------------------

describe("handleCredits", () => {
  test("delegates to the CreditManager and returns its snapshot", async () => {
    const snapshot = [{ engineId: "tavily", remaining: 100, used: 0 }];
    const container = makeContainerWithFakeCreditManager(snapshot);

    const result = await handleCredits(container);

    expect(result).toEqual(snapshot);
  });

  test("works for an empty snapshot list", async () => {
    const container = makeContainerWithFakeCreditManager([]);

    const result = await handleCredits(container);

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// handleHealth
// ---------------------------------------------------------------------------

describe("handleHealth", () => {
  function makeContainerWithRegistry(providers: SearchProvider[]): Container {
    const container = new Container();
    container.singleton(ServiceKeys.PROVIDER_REGISTRY, () => {
      const registry = new ProviderRegistry();
      for (const provider of providers) {
        registry.register(provider);
      }
      return registry;
    });
    return container;
  }

  test("marks healthy lifecycle providers as 'healthy'", async () => {
    const container = makeContainerWithRegistry([
      new StubLifecycleProvider("tavily", { healthy: true }),
      new StubLifecycleProvider("brave", { healthy: true }),
    ]);

    const result = await handleHealth(container);

    expect(result).toEqual([
      { engineId: "tavily", status: "healthy" },
      { engineId: "brave", status: "healthy" },
    ]);
  });

  test("marks failing lifecycle providers as 'unhealthy' with the error message", async () => {
    const container = makeContainerWithRegistry([
      new StubLifecycleProvider("tavily", { healthy: true }),
      new StubLifecycleProvider("brave", { healthy: false }),
    ]);

    const result = await handleHealth(container);

    expect(result[0]).toEqual({ engineId: "tavily", status: "healthy" });
    expect(result[1]?.status).toBe("unhealthy");
    expect(result[1]?.message).toContain("brave is down");
  });

  test("marks providers without a lifecycle interface as 'skipped'", async () => {
    const container = makeContainerWithRegistry([
      new StubSearchProvider("plain-provider"),
      new StubLifecycleProvider("tavily", { healthy: true }),
    ]);

    const result = await handleHealth(container);

    expect(result).toEqual([
      { engineId: "plain-provider", status: "skipped" },
      { engineId: "tavily", status: "healthy" },
    ]);
  });

  test("returns an empty array when no providers are registered", async () => {
    const container = makeContainerWithRegistry([]);

    const result = await handleHealth(container);

    expect(result).toEqual([]);
  });
});
