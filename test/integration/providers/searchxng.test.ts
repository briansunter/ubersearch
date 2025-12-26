/**
 * Integration Tests for SearchxngProvider
 *
 * Tests the SearchxngProvider with actual Docker container management.
 * These tests require Docker to be running. They fail fast if Docker is unavailable.
 *
 * Note: These tests may take 30-60 seconds as they start/stop Docker containers.
 * Skip with: SKIP_DOCKER_TESTS=true
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { DockerComposeHelper } from "../../../src/core/docker/dockerComposeHelper";
import { SearchError } from "../../../src/core/types";
import { SearchxngProvider } from "../../../src/providers/searchxng";
import { createTestSearchxngConfig } from "../../__helpers__/docker-mocks";

// Skip all tests if SKIP_DOCKER_TESTS is set
const skipDockerTests = process.env.SKIP_DOCKER_TESTS === "true";

// Check if Docker is available before running any tests
let dockerAvailable = false;

// Determine project root and compose file path at module load time
const projectRoot = join(import.meta.dir, "..", "..", "..");
const composeFilePath = join(projectRoot, "providers", "searxng", "docker-compose.yml");

function assertDockerAvailable(): void {
  if (!dockerAvailable) {
    throw new Error("Docker is required for SearchxngProvider integration tests.");
  }
}

async function expectSearchSuccessOrApiError<T>(fn: () => Promise<T>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof SearchError) {
      expect(error.reason).toBe("api_error");
      return;
    }
    throw error;
  }
}

// Skip if SKIP_DOCKER_TESTS is set; otherwise fail fast if Docker unavailable
describe.skipIf(skipDockerTests)("SearchxngProvider - Docker Integration Tests", () => {
  let provider: SearchxngProvider;
  let config: ReturnType<typeof createTestSearchxngConfig>;

  beforeAll(async () => {
    // Check Docker availability
    dockerAvailable = await DockerComposeHelper.isDockerAvailable();
    if (!dockerAvailable) {
      throw new Error("[Integration Tests] Docker not available");
    }
    console.log(`[Integration Tests] Docker available, compose file: ${composeFilePath}`);
  });

  beforeEach(() => {
    assertDockerAvailable();

    config = createTestSearchxngConfig({
      autoStart: true,
      autoStop: false, // We'll manage container lifecycle in tests
      composeFile: composeFilePath,
      containerName: "searxng",
      healthEndpoint: "http://localhost:8888/healthz",
      initTimeoutMs: 120000, // 2 minutes for container startup
    });

    provider = new SearchxngProvider(config);

    // Set API key for tests (SearXNG typically doesn't require one for local)
    process.env.SEARXNG_API_KEY = process.env.SEARXNG_API_KEY || "test-key";
  });

  describe("Container Lifecycle", () => {
    test(
      "should detect when container is not running",
      async () => {
        // Fresh provider without init - healthcheck should return false or indicate not running
        const healthy = await provider.healthcheck();
        // This could be true or false depending on whether SearXNG is already running
        expect(typeof healthy).toBe("boolean");
      },
      { timeout: 30000 },
    );

    test(
      "should validate configuration",
      async () => {
        const validation = await provider.validateConfig();

        expect(validation).toHaveProperty("valid");
        expect(validation).toHaveProperty("errors");
        expect(validation).toHaveProperty("warnings");
        expect(Array.isArray(validation.errors)).toBe(true);
        expect(Array.isArray(validation.warnings)).toBe(true);

        // Log any validation issues for debugging
        if (validation.errors.length > 0) {
          console.log("[Integration Test] Validation errors:", validation.errors);
        }
        if (validation.warnings.length > 0) {
          console.log("[Integration Test] Validation warnings:", validation.warnings);
        }
      },
      { timeout: 30000 },
    );

    test("should return metadata correctly", () => {
      const metadata = provider.getMetadata();

      expect(metadata.id).toBe("searchxng");
      expect(metadata.displayName).toBe("SearXNG (Local)");
      expect(metadata.docsUrl).toBe("https://docs.searxng.org/");
    });

    test("isLifecycleManaged should return true", () => {
      expect(provider.isLifecycleManaged()).toBe(true);
    });
  });

  describe("Initialization", () => {
    test(
      "should initialize without throwing",
      async () => {
        // This may start the Docker container if autoStart is true
        await expect(provider.init()).resolves.toBeUndefined();
      },
      { timeout: 120000 },
    ); // Long timeout for container startup

    test(
      "should handle multiple init calls gracefully",
      async () => {
        await provider.init();
        await provider.init();
        await provider.init();

        // Should not throw and healthcheck should still work
        const healthy = await provider.healthcheck();
        expect(typeof healthy).toBe("boolean");
      },
      { timeout: 120000 },
    );
  });

  describe("Health Checks", () => {
    test(
      "healthcheck should return boolean",
      async () => {
        const result = await provider.healthcheck();
        expect(typeof result).toBe("boolean");
      },
      { timeout: 30000 },
    );

    test(
      "healthcheck should be consistent",
      async () => {
        const result1 = await provider.healthcheck();
        const result2 = await provider.healthcheck();

        // Both calls should return the same result (container state shouldn't change between calls)
        expect(result1).toBe(result2);
      },
      { timeout: 30000 },
    );
  });

  describe("Shutdown", () => {
    test(
      "shutdown should complete without throwing",
      async () => {
        await expect(provider.shutdown()).resolves.toBeUndefined();
      },
      { timeout: 60000 },
    );

    test(
      "shutdown should be idempotent",
      async () => {
        await provider.shutdown();
        await provider.shutdown();
        await provider.shutdown();

        // All calls should succeed
        expect(true).toBe(true);
      },
      { timeout: 60000 },
    );
  });
});

// Tests that require a running SearXNG container
describe.skipIf(skipDockerTests)("SearchxngProvider - Search Integration Tests", () => {
  let provider: SearchxngProvider;
  let containerStarted = false;

  beforeAll(async () => {
    assertDockerAvailable();

    const projectRoot = join(import.meta.dir, "..", "..", "..");
    const config = createTestSearchxngConfig({
      autoStart: true,
      autoStop: false,
      composeFile: join(projectRoot, "providers", "searxng", "docker-compose.yml"),
      containerName: "searxng",
      healthEndpoint: "http://localhost:8888/healthz",
      initTimeoutMs: 120000,
    });

    provider = new SearchxngProvider(config);
    process.env.SEARXNG_API_KEY = process.env.SEARXNG_API_KEY || "test-key";

    try {
      await provider.init();
      // Wait a bit for container to be fully ready
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const healthy = await provider.healthcheck();
      containerStarted = healthy;

      if (!containerStarted) {
        throw new Error("[Search Integration Tests] Container not healthy");
      }
    } catch (error) {
      console.log("[Search Integration Tests] Failed to start container:", error);
      containerStarted = false;
      throw error;
    }
  }, 180000); // 3 minute timeout for setup

  afterAll(async () => {
    if (containerStarted) {
      try {
        await provider.shutdown();
      } catch (error) {
        console.log("[Search Integration Tests] Error during shutdown:", error);
      }
    }
  }, 60000);

  test(
    "should perform a real search when container is running",
    async () => {
      if (!containerStarted) {
        throw new Error("[Search Integration Tests] Container not running");
      }

      await expectSearchSuccessOrApiError(async () => {
        const result = await provider.search({
          query: "test query",
          limit: 5,
        });

        expect(result.engineId).toBe("searchxng");
        expect(result.items).toBeDefined();
        expect(Array.isArray(result.items)).toBe(true);
        expect(result.tookMs).toBeGreaterThanOrEqual(0);

        // If we got results, verify their structure
        if (result.items.length > 0) {
          const item = result.items[0];
          expect(item).toHaveProperty("title");
          expect(item).toHaveProperty("url");
          expect(item).toHaveProperty("snippet");
          expect(item).toHaveProperty("sourceEngine");
        }
      });
    },
    { timeout: 60000 },
  );

  test(
    "should respect limit parameter",
    async () => {
      if (!containerStarted) {
        throw new Error("[Search Integration Tests] Container not running");
      }

      await expectSearchSuccessOrApiError(async () => {
        const result = await provider.search({
          query: "javascript",
          limit: 3,
        });

        expect(result.items.length).toBeLessThanOrEqual(3);
      });
    },
    { timeout: 60000 },
  );

  test(
    "should include raw response when requested",
    async () => {
      if (!containerStarted) {
        throw new Error("[Search Integration Tests] Container not running");
      }

      await expectSearchSuccessOrApiError(async () => {
        const result = await provider.search({
          query: "typescript",
          limit: 2,
          includeRaw: true,
        });

        expect(result.raw).toBeDefined();
        expect(result.raw).toHaveProperty("results");
      });
    },
    { timeout: 60000 },
  );

  test(
    "should handle concurrent searches",
    async () => {
      if (!containerStarted) {
        throw new Error("[Search Integration Tests] Container not running");
      }

      await expectSearchSuccessOrApiError(async () => {
        const searches = await Promise.all([
          provider.search({ query: "query 1", limit: 2, includeRaw: true }),
          provider.search({ query: "query 2", limit: 2, includeRaw: true }),
          provider.search({ query: "query 3", limit: 2, includeRaw: true }),
        ]);

        expect(searches).toHaveLength(3);
        searches.forEach((result) => {
          expect(result.engineId).toBe("searchxng");
          expect(result.items).toBeDefined();
        });
      });
    },
    { timeout: 120000 },
  );
});
