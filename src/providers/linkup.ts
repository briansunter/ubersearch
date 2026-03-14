/**
 * Linkup Search Provider Implementation
 * https://www.linkup.ai/
 */

import type { LinkupConfig } from "../config/types";
import type { ILifecycleProvider } from "../core/provider";
import type { SearchQuery, SearchResponse } from "../core/types";
import { BaseProvider } from "./BaseProvider";
import { PROVIDER_DEFAULTS } from "./constants";
import {
  addLifecycleMethods,
  createDockerLifecycle,
  mapSearchResults,
  PROVIDER_MAPPINGS,
} from "./helpers";
import type { LinkupApiResponse, LinkupSearchResult } from "./types";
import { fetchWithErrorHandling } from "./utils";

export class LinkupProvider extends BaseProvider<LinkupConfig> implements ILifecycleProvider {
  constructor(config: LinkupConfig) {
    super(config);

    const manager = createDockerLifecycle(config);
    addLifecycleMethods(this, manager);
  }

  protected getDocsUrl(): string {
    return "https://docs.linkup.ai/";
  }

  protected getApiKeyEnv(): string {
    return this.config.apiKeyEnv;
  }

  async search(query: SearchQuery): Promise<SearchResponse> {
    const apiKey = this.getApiKey();

    const requestBody = {
      q: query.query,
      depth: "standard",
      outputType: "searchResults",
      maxResults: query.limit ?? 5,
    };

    const { data: json, tookMs } = await fetchWithErrorHandling<LinkupApiResponse>(
      this.id,
      this.config.endpoint,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        timeoutMs: PROVIDER_DEFAULTS.DEFAULT_TIMEOUT_MS,
      },
      "Linkup",
    );

    const results: LinkupSearchResult[] = json.results ?? [];

    this.validateResults(results, "Linkup");

    // Map to normalized format
    const items = mapSearchResults(results, this.id, PROVIDER_MAPPINGS.linkup);

    return {
      engineId: this.id,
      items,
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
