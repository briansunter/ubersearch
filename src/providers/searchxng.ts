/**
 * SearXNG Search Provider Implementation
 *
 * Integrates SearXNG with auto-start Docker container management
 */

import { dirname } from "node:path";
import type { SearchxngConfig as BaseSearchxngConfig } from "../config/types";
import { DockerLifecycleManager } from "../core/docker/dockerLifecycleManager";
import { createLogger } from "../core/logger";
import type { ILifecycleProvider, ProviderMetadata } from "../core/provider";
import type { SearchQuery, SearchResponse, SearchResultItem } from "../core/types";
import { SearchError } from "../core/types";
import { BaseProvider } from "./BaseProvider";
import { PROVIDER_DEFAULTS } from "./constants";
import type { SearxngApiResponse, SearxngInfobox, SearxngSearchResult } from "./types";
import { buildUrl, fetchWithErrorHandling } from "./utils";

const log = createLogger("SearXNG");

export class SearchxngProvider
  extends BaseProvider<BaseSearchxngConfig>
  implements ILifecycleProvider
{
  private lifecycleManager: DockerLifecycleManager;
  private defaultLimit: number;

  constructor(config: BaseSearchxngConfig) {
    super(config);
    this.defaultLimit = config.defaultLimit;

    const autoStart = config.autoStart ?? true;
    const autoStop = config.autoStop ?? true;
    const initTimeoutMs = config.initTimeoutMs ?? PROVIDER_DEFAULTS.SEARXNG_INIT_TIMEOUT_MS;

    const projectRoot = config.composeFile ? dirname(config.composeFile) : process.cwd();

    this.lifecycleManager = new DockerLifecycleManager({
      containerName: config.containerName,
      composeFile: config.composeFile,
      healthEndpoint: config.healthEndpoint,
      autoStart,
      autoStop,
      initTimeoutMs,
      projectRoot,
    });
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
      const isInitializing = !!(await (this.lifecycleManager as any).initPromise);
      if (!isInitializing) {
        try {
          log.debug("Container not healthy, attempting auto-start...");
          await this.init();
          // Re-check health after init attempt
          isHealthy = await this.healthcheck();
        } catch (initError) {
          const message = initError instanceof Error ? initError.message : String(initError);
          log.debug(`Failed to auto-start container: ${message}`);
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
    const url = buildUrl(this.config.endpoint, {
      q: query.query,
      format: "json",
      language: "all",
      pageno: 1,
      safesearch: 0,
    });

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
    const items: SearchResultItem[] = results.map((r: SearxngSearchResult) => ({
      title: r.title ?? r.url ?? "#",
      url: r.url ?? "#",
      snippet: r.content ?? r.description ?? "",
      score: r.score ?? r.rank,
      sourceEngine: r.engine ?? this.id,
    }));

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

  // ILifecycleProvider implementation
  async init(): Promise<void> {
    await this.lifecycleManager.init();
  }

  async healthcheck(): Promise<boolean> {
    return await this.lifecycleManager.healthcheck();
  }

  async shutdown(): Promise<void> {
    await this.lifecycleManager.shutdown();
  }

  async validateConfig(): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    return await this.lifecycleManager.validateDockerConfig();
  }

  isLifecycleManaged(): boolean {
    return true;
  }
}
