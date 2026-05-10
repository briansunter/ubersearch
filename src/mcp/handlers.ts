/**
 * MCP tool handlers.
 *
 * Each handler takes already-parsed arguments plus a DI container and returns
 * the tool's raw result. They have no JSON-RPC awareness — the dispatch layer
 * is responsible for wrapping the return value in the MCP `content` envelope
 * and for mapping thrown errors to JSON-RPC error codes.
 */

import type { Container } from "../core/container";
import { getErrorMessage } from "../core/errorUtils";
import type { ProviderRegistry } from "../core/provider";
import { ServiceKeys } from "../core/serviceKeys";
import { isLifecycleProvider } from "../plugin/types";
import { getCreditStatus, uberSearch } from "../tool/uberSearchTool";
import type { SearchStrategyName } from "./parseArgs";

const SEARCH_TIMEOUT_MS = 60_000;
const CREDITS_TIMEOUT_MS = 10_000;
const HEALTHCHECK_TIMEOUT_MS = 5_000;

export interface UberSearchHandlerArgs {
  query: string;
  engines?: string[];
  strategy?: SearchStrategyName;
  limit?: number;
  categories?: string[];
}

export interface HealthResult {
  engineId: string;
  status: "healthy" | "unhealthy" | "skipped";
  message?: string;
}

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

export async function handleUberSearch(
  args: UberSearchHandlerArgs,
  container: Container,
): Promise<unknown> {
  return withTimeout(
    uberSearch(
      {
        query: args.query,
        limit: args.limit,
        engines: args.engines,
        strategy: args.strategy,
        categories: args.categories,
      },
      { containerOverride: container },
    ),
    SEARCH_TIMEOUT_MS,
    "uberSearch",
  );
}

export async function handleCredits(container: Container): Promise<unknown> {
  return withTimeout(
    getCreditStatus({ containerOverride: container }),
    CREDITS_TIMEOUT_MS,
    "getCreditStatus",
  );
}

export async function handleHealth(container: Container): Promise<HealthResult[]> {
  const registry = container.get<ProviderRegistry>(ServiceKeys.PROVIDER_REGISTRY);
  const providers = registry.list();

  const results: HealthResult[] = [];
  for (const provider of providers) {
    if (!isLifecycleProvider(provider)) {
      results.push({ engineId: provider.id, status: "skipped" });
      continue;
    }
    try {
      await withTimeout(
        provider.healthcheck(),
        HEALTHCHECK_TIMEOUT_MS,
        `healthcheck ${provider.id}`,
      );
      results.push({ engineId: provider.id, status: "healthy" });
    } catch (error) {
      results.push({
        engineId: provider.id,
        status: "unhealthy",
        message: getErrorMessage(error),
      });
    }
  }
  return results;
}
