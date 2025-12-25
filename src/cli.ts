#!/usr/bin/env bun
/**
 * Multi-Search CLI
 *
 * Unified search interface for multiple search providers
 */

import { bootstrapContainer, isLifecycleProvider } from "./bootstrap/container";
import type { ProviderRegistry } from "./core/provider";
import { ServiceKeys } from "./core/serviceKeys";
import type { AiSearchOutput } from "./tool/interface";
import { getCreditStatus, multiSearch } from "./tool/multiSearchTool";

// Parse command line arguments
let args = process.argv.slice(2);

// Parse --config first and remove from args (global option that can appear anywhere)
const configIdx = args.indexOf("--config");
let configPath: string | undefined;
if (configIdx !== -1) {
  configPath = args[configIdx + 1];
  if (!configPath || configPath.startsWith("--")) {
    console.error("Error: --config requires a file path");
    process.exit(1);
  }
  args.splice(configIdx, 2);
}

// Show help
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(`
ai-search — Unified search across multiple providers

USAGE:
    ai-search <query> [options]
    ai-search credits

ARGUMENTS:
    <query>     Search query (required, unless using 'credits' command)
    credits     Show credit status for all engines
    health      Run health checks on all providers

OPTIONS:
    --json                      Output results as JSON
    --engines <engine,list>     Use specific engines (comma-separated)
    --strategy <strategy>       Search strategy: 'all' or 'first-success' (default: all)
    --limit <number>            Maximum results per engine
    --include-raw               Include raw provider responses
    --config <path>             Path to configuration file
    --help, -h                  Show this help message

EXAMPLES:
    ai-search "best TypeScript ORM 2025"
    ai-search "llm observability" --engines tavily,brave --json
    ai-search "hawaii dev meetups" --strategy first-success
    ai-search credits
    ai-search health
    ai-search --config /path/to/config.json credits
    ai-search "query" --config /path/to/config.json

CONFIGURATION:
    Config files are searched in order:
    1. ./ai-search.config.json
    2. $XDG_CONFIG_HOME/ai-search/config.json
    3. ~/.config/ai-search/config.json

ENVIRONMENT:
    Set API keys in environment variables:
    - TAVILY_API_KEY      for Tavily
    - BRAVE_API_KEY       for Brave Search
`);
  process.exit(0);
}

// Credits command
if (args[0] === "credits") {
  await showCredits(configPath);
  process.exit(0);
}

// Health check command
if (args[0] === "health") {
  await runHealthChecks(configPath);
  process.exit(0);
}

// Parse options
const options = {
  json: args.includes("--json"),
  includeRaw: args.includes("--include-raw"),
  engines: undefined as string[] | undefined,
  strategy: undefined as "all" | "first-success" | undefined,
  limit: undefined as number | undefined,
};

// Parse --engines
const enginesIdx = args.indexOf("--engines");
if (enginesIdx !== -1) {
  const enginesArg = args[enginesIdx + 1];
  if (enginesArg !== undefined) {
    options.engines = enginesArg.split(",").map((e) => e.trim());
  }
}

// Parse --strategy
const strategyIdx = args.indexOf("--strategy");
if (strategyIdx !== -1 && args[strategyIdx + 1]) {
  const strategy = args[strategyIdx + 1];
  if (strategy === "all" || strategy === "first-success") {
    options.strategy = strategy;
  } else {
    console.error(`Invalid strategy: ${strategy}. Must be 'all' or 'first-success'`);
    process.exit(1);
  }
}

// Parse --limit
const limitIdx = args.indexOf("--limit");
if (limitIdx !== -1) {
  const limitArg = args[limitIdx + 1];
  if (limitArg !== undefined) {
    const limit = parseInt(limitArg, 10);
    if (Number.isNaN(limit) || limit < 1) {
      console.error(`Invalid limit: ${limitArg}. Must be a positive number`);
      process.exit(1);
    }
    options.limit = limit;
  }
}

// Extract query (non-option arguments)
// Filter out option flags (--*) and their values
const optionsWithValues = ["--engines", "--strategy", "--limit", "--config"];
const queryParts = args.filter((arg, idx) => {
  // Skip arguments starting with --
  if (arg.startsWith("--")) {
    return false;
  }
  // Skip special commands
  if (["credits", "health"].includes(arg)) {
    return false;
  }
  // Skip values that follow option flags
  const prevArg = args[idx - 1];
  if (prevArg && optionsWithValues.includes(prevArg)) {
    return false;
  }
  return true;
});

const query = queryParts.join(" ").trim();

if (!query) {
  console.error("Error: Query is required");
  console.error("Run with --help for usage information");
  process.exit(1);
}

// Execute search
async function main() {
  try {
    // Bootstrap the DI container
    const _container = await bootstrapContainer(configPath);

    const result = await multiSearch(
      {
        query,
        limit: options.limit,
        engines: options.engines,
        includeRaw: options.includeRaw,
        strategy: options.strategy,
      },
      configPath,
    );

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printHumanReadable(result);
    }
  } catch (error) {
    console.error("Search failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Print results in human-readable format
 */
function printHumanReadable(result: AiSearchOutput) {
  console.log(`\nQuery: "${result.query}"`);
  console.log(`Found ${result.items.length} results\n`);

  if (result.items.length === 0) {
    console.log("No results found.");
    return;
  }

  // Group results by engine
  const byEngine = new Map<string, typeof result.items>();
  for (const item of result.items) {
    if (!byEngine.has(item.sourceEngine)) {
      byEngine.set(item.sourceEngine, []);
    }
    byEngine.get(item.sourceEngine)?.push(item);
  }

  // Print results
  for (const [engineId, items] of byEngine) {
    if (items.length > 0) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`${engineId} (${items.length} results)`);
      console.log(`${"=".repeat(60)}`);

      for (let i = 0; i < items.length && i < 5; i++) {
        const item = items[i];
        if (!item) {
          continue;
        }
        console.log(`\n${i + 1}. ${item.title}`);
        console.log(`   ${item.url}`);
        if (item.score) {
          console.log(`   Score: ${item.score}`);
        }
        if (item.snippet) {
          console.log(
            `   ${item.snippet.substring(0, 200)}${item.snippet.length > 200 ? "..." : ""}`,
          );
        }
      }

      if (items.length > 5) {
        console.log(`\n   ... and ${items.length - 5} more results`);
      }
    }
  }

  // Print engine status
  console.log(`\n${"=".repeat(60)}`);
  console.log("Engine Status");
  console.log(`${"=".repeat(60)}`);
  for (const attempt of result.enginesTried) {
    const status = attempt.success
      ? "✓ Success"
      : `✗ Failed${attempt.reason ? ` (${attempt.reason})` : ""}`;
    console.log(`${attempt.engineId.padEnd(15)} ${status}`);
  }

  // Print credit warnings
  if (result.credits) {
    const lowCredits = result.credits.filter((c) => c.remaining < c.quota * 0.2);
    if (lowCredits.length > 0) {
      console.log(`\n⚠️  Low credit warnings:`);
      for (const credit of lowCredits) {
        console.log(`   ${credit.engineId}: ${credit.remaining} remaining of ${credit.quota}`);
      }
    }
  }

  console.log();
}

/**
 * Run health checks on all providers
 */
async function runHealthChecks(configPath?: string) {
  try {
    // Bootstrap the DI container
    const container = await bootstrapContainer(configPath);
    const registry = container.get<ProviderRegistry>(ServiceKeys.PROVIDER_REGISTRY);
    const providers = registry.list();

    console.log("\nProvider Health Checks");
    console.log("=".repeat(60));

    if (providers.length === 0) {
      console.log("No providers are registered.");
      return;
    }

    const results: Array<{
      engineId: string;
      status: "healthy" | "unhealthy" | "skipped";
      message: string;
    }> = [];

    for (const provider of providers) {
      const engineId = provider.id;

      // Check if provider implements lifecycle methods
      if (isLifecycleProvider(provider)) {
        try {
          await provider.healthcheck();
          results.push({
            engineId,
            status: "healthy",
            message: "Health check passed",
          });
          console.log(`✓ ${engineId.padEnd(15)} Healthy`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results.push({
            engineId,
            status: "unhealthy",
            message,
          });
          console.log(`✗ ${engineId.padEnd(15)} Unhealthy - ${message}`);
        }
      } else {
        results.push({
          engineId,
          status: "skipped",
          message: "Health checks not supported",
        });
        console.log(`- ${engineId.padEnd(15)} Skipped (no health check support)`);
      }
    }

    // Summary
    const healthy = results.filter((r) => r.status === "healthy").length;
    const unhealthy = results.filter((r) => r.status === "unhealthy").length;
    const skipped = results.filter((r) => r.status === "skipped").length;

    console.log(`\nSummary: ${healthy} healthy, ${unhealthy} unhealthy, ${skipped} skipped`);

    if (unhealthy > 0) {
      console.log("\n⚠️  Some providers are unhealthy. Check configuration and connectivity.");
      process.exit(1);
    } else {
      console.log("\n✓ All providers are healthy");
    }

    console.log();
  } catch (error) {
    console.error("Health check failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Show credit status
 */
async function showCredits(configPath?: string) {
  try {
    const credits = await getCreditStatus(configPath);

    if (!credits || credits.length === 0) {
      console.log("No credits configured or no engines enabled.");
      return;
    }

    console.log("\nCredit Status");
    console.log("=".repeat(60));

    for (const credit of credits) {
      const usedPercent = ((credit.used / credit.quota) * 100).toFixed(1);
      const status = credit.isExhausted
        ? "⚠️  EXHAUSTED"
        : credit.remaining < credit.quota * 0.2
          ? "⚠️  Low"
          : "✓ OK";

      console.log(`\n${credit.engineId}`);
      console.log(`  Used:      ${credit.used} / ${credit.quota} (${usedPercent}%)`);
      console.log(`  Remaining: ${credit.remaining}`);
      console.log(`  Status:    ${status}`);
    }

    console.log();
  } catch (error) {
    console.error(
      "Failed to load credits:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

// Run main
main();
