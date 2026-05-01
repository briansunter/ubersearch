/**
 * Base Provider Class
 *
 * Shared functionality for all search providers to reduce duplication
 */

import type { EngineConfigBase } from "../config/types";
import type { ProviderMetadata, SearchProvider } from "../core/provider";
import type { SearchQuery, SearchResponse } from "../core/types";
import { SearchError } from "../core/types";
import { getApiKey, validateResults } from "./utils";

export abstract class BaseProvider<T extends EngineConfigBase> implements SearchProvider {
  readonly id: string;
  protected config: T;

  constructor(config: T) {
    this.id = config.id;
    this.config = config;
  }

  /**
   * Check if this provider requires an API key.
   * Override in subclasses that don't require API keys (e.g., SearXNG).
   */
  protected requiresApiKey(): boolean {
    return true;
  }

  /**
   * Check if this provider is properly configured (has API key if required).
   * Used by bootstrap to skip unconfigured providers silently.
   */
  isConfigured(): boolean {
    if (!this.requiresApiKey()) {
      return true;
    }

    const apiKeyEnv = this.getApiKeyEnv();
    if (!apiKeyEnv) {
      return true; // No env var configured, consider it configured
    }

    const apiKey = process.env[apiKeyEnv]?.trim();
    return !!apiKey;
  }

  /**
   * Get the missing configuration message for this provider.
   */
  getMissingConfigMessage(): string {
    const apiKeyEnv = this.getApiKeyEnv();
    return `API key not configured. Set ${apiKeyEnv} environment variable.`;
  }

  getMetadata(): ProviderMetadata {
    return {
      id: this.id,
      displayName: this.config.displayName,
      docsUrl: this.getDocsUrl(),
    };
  }

  abstract search(query: SearchQuery): Promise<SearchResponse>;
  protected abstract getDocsUrl(): string;
  protected abstract getApiKeyEnv(): string;

  protected getApiKey(): string {
    return getApiKey(this.id, this.getApiKeyEnv());
  }

  protected validateResults(results: unknown, providerName: string): void {
    validateResults(this.id, results, providerName);
  }

  protected throwSearchError(
    type: "config_error" | "network_error" | "api_error" | "no_results" | "provider_unavailable",
    message: string,
    statusCode?: number,
  ): never {
    throw new SearchError(this.id, type, message, statusCode);
  }
}
