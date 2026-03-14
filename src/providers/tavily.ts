/**
 * Tavily Search Provider Implementation
 */

import type { TavilyConfig } from "../config/types";
import type { SearchQuery, SearchResponse } from "../core/types";
import { BaseProvider } from "./BaseProvider";
import { PROVIDER_DEFAULTS } from "./constants";
import { mapSearchResults, PROVIDER_MAPPINGS } from "./helpers";
import type { TavilyApiResponse } from "./types";
import { fetchWithErrorHandling } from "./utils";

export class TavilyProvider extends BaseProvider<TavilyConfig> {
  protected getDocsUrl(): string {
    return "https://docs.tavily.com/";
  }

  protected getApiKeyEnv(): string {
    return this.config.apiKeyEnv;
  }

  async search(query: SearchQuery): Promise<SearchResponse> {
    const apiKey = this.getApiKey();

    const requestBody = {
      api_key: apiKey,
      query: query.query,
      search_depth: this.config.searchDepth,
      max_results: query.limit ?? 5,
      include_answer: false,
      include_raw_content: false,
      include_images: false,
    };

    // Make request with error handling
    const { data: json, tookMs } = await fetchWithErrorHandling<TavilyApiResponse>(
      this.id,
      this.config.endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        timeoutMs: PROVIDER_DEFAULTS.DEFAULT_TIMEOUT_MS,
      },
      "Tavily",
    );

    this.validateResults(json.results, "Tavily");

    // Map to normalized format and filter out invalid results
    const items = mapSearchResults(
      json.results,
      this.id,
      PROVIDER_MAPPINGS.tavily,
      (r) =>
        (r.title != null || r.url != null) &&
        (r.title != null || r.content != null || r.snippet != null),
    );

    return {
      engineId: this.id,
      items,
      raw: query.includeRaw ? json : undefined,
      tookMs,
    };
  }
}
