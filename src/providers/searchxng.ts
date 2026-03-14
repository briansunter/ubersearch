/**
 * SearXNG Search Provider Implementation
 *
 * Integrates SearXNG with auto-start Docker container management
 */

import { dirname } from "node:path";
import type { SearchxngConfig as BaseSearchxngConfig } from "../config/types";
import { createLogger } from "../core/logger";
import type { ILifecycleProvider, ProviderMetadata } from "../core/provider";
import type { SearchQuery, SearchResponse, SearchResultItem } from "../core/types";
import { SearchError } from "../core/types";
import { BaseProvider } from "./BaseProvider";
import { PROVIDER_DEFAULTS } from "./constants";
import {
  addLifecycleMethods,
  createDockerLifecycle,
  mapSearchResults,
  PROVIDER_MAPPINGS,
} from "./helpers";
import type { SearxngApiResponse, SearxngInfobox, SearxngSearchResult } from "./types";
import { buildUrl, fetchWithErrorHandling } from "./utils";

const log = createLogger("SearXNG");

export class SearchxngProvider
  extends BaseProvider<BaseSearchxngConfig>
  implements ILifecycleProvider
{
  private lifecycleManager: ReturnType<typeof createDockerLifecycle>;
  private defaultLimit: number;

  constructor(config: BaseSearchxngConfig) {
    super(config);
    this.defaultLimit = config.defaultLimit;

    const projectRoot = config.composeFile ? dirname(config.composeFile) : process.cwd();

    this.lifecycleManager = createDockerLifecycle(config, {
      autoStart: true,
      autoStop: true,
      initTimeoutMs: PROVIDER_DEFAULTS.SEARXNG_INIT_TIMEOUT_MS,
      projectRoot,
    });
    addLifecycleMethods(this, this.lifecycleManager);
  }

  protected getDocsUrl(): string {
    return "https://docs.searxng.org/";
  }

  protected getApiKeyEnv(): string {
    return this.config.apiKeyEnv ?? "";
  }

  // SearXNG doesn't require an API key (it's a local service)
  protected override requiresApiKey(): boolean {
    return false;
  }

  override getMetadata(): ProviderMetadata {
    return {
      id: this.id,
      displayName: "SearXNG (Local)",
      docsUrl: this.getDocsUrl(),
    };
  }

  protected override getApiKey(): string {
    const apiKeyEnv = this.getApiKeyEnv();
    if (apiKeyEnv) {
      return process.env[apiKeyEnv] ?? "";
    }
    return "";
  }

  async search(query: SearchQuery): Promise<SearchResponse> {
    let isHealthy = await this.healthcheck();

    if (!isHealthy) {
      const isInitializing = this.lifecycleManager.isInitializing();
      if (!isInitializing) {
        try {
          log.debug("Container not healthy, attempting auto-start...");
          await this.init();
          // Re-check health after init attempt
          isHealthy = await this.healthcheck();
        } catch (initError) {
          const message = initError instanceof Error ? initError.message : String(initError);
          log.warn(`Failed to auto-start container: ${message}`);
        }
      }
    }

    if (!isHealthy) {
      throw new SearchError(
        this.id,
        "provider_unavailable",
        "SearXNG container is not healthy. Check logs with: docker compose logs -f searxng",
      );
    }

    const limit = query.limit ?? this.defaultLimit;
    const params: Record<string, string | number> = {
      q: query.query,
      format: "json",
      language: "all",
      pageno: 1,
      safesearch: 0,
    };

    // Add categories if specified (e.g., "general,it,science")
    if (query.categories && query.categories.length > 0) {
      params.categories = query.categories.join(",");
    }

    const url = buildUrl(this.config.endpoint, params);

    const { data: json, tookMs } = await fetchWithErrorHandling<SearxngApiResponse>(
      this.id,
      url,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Forwarded-For": "127.0.0.1",
          "X-Real-IP": "127.0.0.1",
        },
        timeoutMs: PROVIDER_DEFAULTS.DEFAULT_TIMEOUT_MS,
      },
      "SearXNG",
    );

    const results: SearxngSearchResult[] = Array.isArray(json.results) ? json.results : [];
    const infoboxes: SearxngInfobox[] = Array.isArray(json.infoboxes) ? json.infoboxes : [];

    // Convert regular results
    const items: SearchResultItem[] = mapSearchResults(
      results,
      this.id,
      PROVIDER_MAPPINGS.searchxng,
    );

    // Add infoboxes as results (Wikipedia, etc.)
    for (const box of infoboxes) {
      const boxUrl = box.id ?? box.urls?.[0]?.url;
      if (boxUrl) {
        items.push({
          title: box.infobox ?? "Info",
          url: boxUrl,
          snippet: box.content ?? "",
          sourceEngine: box.engine ?? "wikipedia",
        });
      }
    }

    // Only validate if we have no results at all
    if (items.length === 0) {
      this.validateResults(results, "SearXNG");
    }

    const limitedItems = items.slice(0, limit);

    return {
      engineId: this.id,
      items: limitedItems,
      raw: query.includeRaw ? json : undefined,
      tookMs,
    };
  }

  // Lifecycle methods are added via addLifecycleMethods() in constructor
  declare init: () => Promise<void>;
  declare healthcheck: () => Promise<boolean>;
  declare shutdown: () => Promise<void>;
  declare validateConfig: () => Promise<{ valid: boolean; errors: string[]; warnings: string[] }>;
  declare isLifecycleManaged: () => boolean;
}
