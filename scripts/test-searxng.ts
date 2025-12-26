#!/usr/bin/env bun
/**
 * Test script for SearXNG integration
 */

import { bootstrapContainer, uberSearch } from "../src/app/index";
import { isLifecycleProvider } from "../src/bootstrap/container";
import type { ProviderRegistry } from "../src/core/provider";
import { ServiceKeys } from "../src/core/serviceKeys";

// Set environment variables for testing
process.env.SEARXNG_API_KEY = "test-key-123";

async function testSearXNG() {
  console.log("Testing SearXNG Integration\n");

  try {
    // Test 1: Bootstrap container
    console.log("1. Bootstrapping container...");
    const container = await bootstrapContainer();
    console.log("   ✓ Container bootstrapped\n");

    // Test 2: Check SearXNG health
    console.log("2. Checking SearXNG health...");
    const registry = container.get<ProviderRegistry>(ServiceKeys.PROVIDER_REGISTRY);
    const providers = registry.list();

    const searxngProvider = providers.find((p) => p.id === "searxng");
    if (!searxngProvider) {
      console.log("   ✗ SearXNG provider not found\n");
      return;
    }

    if (isLifecycleProvider(searxngProvider)) {
      try {
        await searxngProvider.healthcheck();
        console.log("   ✓ SearXNG health check passed\n");
      } catch (error) {
        console.log(
          `   ✗ SearXNG health check failed: ${error instanceof Error ? error.message : String(error)}\n`,
        );
        return;
      }
    }

    // Test 3: Search with SearXNG only
    console.log("3. Searching with SearXNG...");
    const result = await uberSearch({
      query: "TypeScript testing framework",
      limit: 5,
      engines: ["searxng"],
      strategy: "all",
    });

    if (result.items.length > 0) {
      console.log(`   ✓ Found ${result.items.length} results:\n`);
      result.items.forEach((item, i) => {
        console.log(`   ${i + 1}. ${item.title}`);
        console.log(`      ${item.url}`);
      });
      console.log();
    } else {
      console.log("   ✗ No results returned\n");
    }

    // Test 4: Check engine status
    console.log("4. Engine status:");
    result.enginesTried.forEach((attempt) => {
      const status = attempt.success ? "✓ Success" : "✗ Failed";
      console.log(`   ${attempt.engineId}: ${status}`);
      if (attempt.reason) {
        console.log(`      Reason: ${attempt.reason}`);
      }
    });
    console.log();
  } catch (error) {
    console.error("Test failed:", error instanceof Error ? error.message : String(error));
    console.error("\nStack trace:");
    console.error(error);
  }
}

testSearXNG();
