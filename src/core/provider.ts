/**
 * Provider abstraction layer
 */

import type { EngineId, SearchQuery, SearchResponse } from "./types";

export interface ProviderMetadata {
  id: EngineId;
  displayName: string;
  docsUrl?: string;
}

/**
 * Abstract interface that all search providers must implement
 */
export interface SearchProvider {
  readonly id: EngineId;
  getMetadata(): ProviderMetadata;
  search(query: SearchQuery): Promise<SearchResponse>;
  /** Check if the provider is properly configured (e.g., API key is set) */
  isConfigured(): boolean;
  /** Get a message explaining what configuration is missing */
  getMissingConfigMessage(): string;
}

export type { ILifecycleProvider } from "./provider/ILifecycleProvider";

/**
 * Registry to manage all available providers
 */
export class ProviderRegistry {
  private providers = new Map<EngineId, SearchProvider>();

  register(provider: SearchProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Provider already registered: ${provider.id}`);
    }
    this.providers.set(provider.id, provider);
  }

  get(id: EngineId): SearchProvider | undefined {
    return this.providers.get(id);
  }

  list(): SearchProvider[] {
    return Array.from(this.providers.values());
  }

  has(id: EngineId): boolean {
    return this.providers.has(id);
  }
}
