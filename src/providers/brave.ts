/**
 * Brave Search Provider Implementation
 */

import type { BraveConfig } from "../config/types";
import type { SearchQuery, SearchResponse } from "../core/types";
import { BaseProvider } from "./BaseProvider";
import { PROVIDER_DEFAULTS } from "./constants";
import { mapSearchResults, PROVIDER_MAPPINGS } from "./helpers";
import type { BraveApiResponse, BraveWebResult } from "./types";
import { buildUrl, fetchWithErrorHandling } from "./utils";

export class BraveProvider extends BaseProvider<BraveConfig> {
  protected getDocsUrl(): string {
    return "https://api.search.brave.com/app/documentation";
  }

  protected getApiKeyEnv(): string {
    return this.config.apiKeyEnv;
  }

  async search(query: SearchQuery): Promise<SearchResponse> {
    const apiKey = this.getApiKey();

    const limit = query.limit ?? this.config.defaultLimit ?? 15;
    const url = buildUrl(this.config.endpoint, {
      q: query.query,
      count: limit,
    });

    // Make request with error handling
    const { data: json, tookMs } = await fetchWithErrorHandling<BraveApiResponse>(
      this.id,
      url,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": apiKey,
        },
        timeoutMs: PROVIDER_DEFAULTS.DEFAULT_TIMEOUT_MS,
      },
      "Brave",
    );

    // Extract web results (handle both response formats)
    const webResults: BraveWebResult[] = json.web?.results ?? json.results ?? [];

    this.validateResults(webResults, "Brave");

    // Map to normalized format
    const items = mapSearchResults(webResults, this.id, PROVIDER_MAPPINGS.brave);

    return {
      engineId: this.id,
      items,
      raw: query.includeRaw ? json : undefined,
      tookMs,
    };
  }
}
