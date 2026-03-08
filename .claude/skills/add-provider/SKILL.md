---
name: add-provider
description: Scaffold a new search provider following project conventions. Use when adding support for a new search engine.
disable-model-invocation: true
---

# Add Search Provider

Create a new search provider for: $ARGUMENTS

## Overview

This skill scaffolds a new search provider following the UberSearch provider architecture. Providers extend `BaseProvider<T>` and implement the `ISearchProvider` interface.

## Files to Create/Modify

### 1. Provider Implementation

Create `src/providers/{kebab-name}.ts`:

```typescript
/**
 * {PascalName} Search Provider Implementation
 */

import type { {PascalName}Config } from "../config/types";
import type { SearchQuery, SearchResponse } from "../core/types";
import { BaseProvider } from "./BaseProvider";
import { PROVIDER_DEFAULTS } from "./constants";
import type { {PascalName}ApiResponse, {PascalName}Result } from "./types";
import { fetchWithErrorHandling } from "./utils";

export class {PascalName}Provider extends BaseProvider<{PascalName}Config> {
  protected getDocsUrl(): string {
    return "https://docs.example.com/";
  }

  protected getApiKeyEnv(): string {
    return this.config.apiKeyEnv;
  }

  async search(query: SearchQuery): Promise<SearchResponse> {
    const apiKey = this.getApiKey();

    // Build request based on API requirements
    const requestBody = {
      query: query.query,
      max_results: query.limit ?? 10,
      // Add provider-specific fields
    };

    // Make request with error handling
    const { data: json, tookMs } = await fetchWithErrorHandling<{PascalName}ApiResponse>(
      this.id,
      this.config.endpoint,
      {
        method: "POST", // or "GET"
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        timeoutMs: PROVIDER_DEFAULTS.DEFAULT_TIMEOUT_MS,
      },
      "{PascalName}",
    );

    this.validateResults(json.results, "{PascalName}");

    // Map to normalized format
    const items = json.results.map((r: {PascalName}Result) => ({
      title: r.title ?? r.url ?? "Untitled",
      url: r.url ?? "",
      snippet: r.snippet ?? r.description ?? r.content ?? "",
      score: r.score,
      sourceEngine: this.id,
    }));

    return {
      engineId: this.id,
      items,
      raw: query.includeRaw ? json : undefined,
      tookMs,
    };
  }
}
```

### 2. Add Types

Add to `src/providers/types/index.ts`:

```typescript
// {PascalName} API Response Types
export interface {PascalName}Result {
  title?: string;
  url?: string;
  snippet?: string;
  description?: string;
  content?: string;
  score?: number;
}

export interface {PascalName}ApiResponse {
  results: {PascalName}Result[];
  // Add other response fields
}
```

### 3. Add Config Type

Add to `src/config/types.ts`:

```typescript
export interface {PascalName}Config extends EngineConfigBase {
  type: "{kebab-name}";
  apiKeyEnv: string;
  endpoint: string;
  // Add provider-specific config fields
}
```

Update `EngineConfig` union type:
```typescript
export type EngineConfig =
  | TavilyConfig
  | BraveConfig
  | LinkupConfig
  | SearchxngConfig
  | {PascalName}Config;
```

### 4. Add Validation Schema

Add to `src/config/validation.ts`:

```typescript
export const {PascalName}ConfigSchema = EngineConfigBaseSchema.extend({
  type: z.literal("{kebab-name}"),
  apiKeyEnv: z.string(),
  endpoint: z.string().url(),
  // Add provider-specific validations
});
```

Update `EngineConfigSchema` discriminated union:
```typescript
export const EngineConfigSchema = z.discriminatedUnion("type", [
  TavilyConfigSchema,
  BraveConfigSchema,
  LinkupConfigSchema,
  SearchxngConfigSchema,
  {PascalName}ConfigSchema,
]);
```

### 5. Register Plugin

Add to `src/plugin/builtin.ts`:

```typescript
import { {PascalName}Provider } from "../providers/{kebab-name}";
import type { {PascalName}Config } from "../config/types";

export const {camelName}Plugin: PluginDefinition<{PascalName}Config, {PascalName}Provider> = {
  type: "{kebab-name}",
  displayName: "{DisplayName}",
  description: "Description of the search provider",
  docsUrl: "https://docs.example.com/",
  version: "1.0.0",
  hasLifecycle: false, // Set to true if using Docker
  factory: (config) => new {PascalName}Provider(config),
};

// Add to builtInPlugins array
export const builtInPlugins = [
  tavilyPlugin,
  bravePlugin,
  linkupPlugin,
  searchxngPlugin,
  {camelName}Plugin,
] as unknown as PluginDefinition<EngineConfigBase, SearchProvider>[];
```

### 6. Export Provider

Add to `src/providers/index.ts`:

```typescript
export { {PascalName}Provider } from "./{kebab-name}";
```

### 7. Create Tests

Create `test/unit/providers/{kebab-name}.test.ts`:

```typescript
/**
 * {PascalName} Provider Tests
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { {PascalName}Config } from "../../../src/config/types";
import type { SearchQuery } from "../../../src/core/types";
import { SearchError } from "../../../src/core/types";
import { {PascalName}Provider } from "../../../src/providers/{kebab-name}";

describe("{PascalName}Provider", () => {
  let provider: {PascalName}Provider;
  let mockConfig: {PascalName}Config;

  beforeEach(() => {
    mockConfig = {
      id: "{kebab-name}",
      type: "{kebab-name}",
      enabled: true,
      displayName: "{DisplayName}",
      monthlyQuota: 1000,
      creditCostPerSearch: 1,
      lowCreditThresholdPercent: 10,
      apiKeyEnv: "{UPPER_NAME}_API_KEY",
      endpoint: "https://api.example.com/search",
      // Add provider-specific config
    };
    provider = new {PascalName}Provider(mockConfig);
  });

  describe("Constructor and Metadata", () => {
    test("should initialize with correct config", () => {
      expect(provider.id).toBe("{kebab-name}");
    });

    test("should return correct metadata", () => {
      const metadata = provider.getMetadata();
      expect(metadata).toEqual({
        id: "{kebab-name}",
        displayName: "{DisplayName}",
        docsUrl: "https://docs.example.com/",
      });
    });
  });

  describe("Search Functionality", () => {
    test("should search successfully with valid API key", async () => {
      global.process.env = { {UPPER_NAME}_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Test Result",
              url: "https://example.com",
              snippet: "Test content",
              score: 0.95,
            },
          ],
        }),
      })) as unknown as typeof fetch;

      const query: SearchQuery = { query: "test query", limit: 5 };
      const response = await provider.search(query);

      expect(response.engineId).toBe("{kebab-name}");
      expect(response.items).toHaveLength(1);
      expect(response.items[0]).toEqual({
        title: "Test Result",
        url: "https://example.com",
        snippet: "Test content",
        score: 0.95,
        sourceEngine: "{kebab-name}",
      });
    });

    test("should include raw response when requested", async () => {
      global.process.env = { {UPPER_NAME}_API_KEY: "test-api-key" };

      const mockResponseData = {
        results: [{ title: "Test", url: "https://example.com", snippet: "Content" }],
        rawField: "raw data",
      };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => mockResponseData,
      }));

      const query: SearchQuery = { query: "test", includeRaw: true };
      const response = await provider.search(query);

      expect(response.raw).toEqual(mockResponseData);
    });
  });

  describe("Error Handling", () => {
    test("should throw error when API key is missing", async () => {
      global.process.env = {};

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow(SearchError);
      await expect(provider.search(query)).rejects.toThrow(
        "Missing environment variable: {UPPER_NAME}_API_KEY",
      );
    });

    test("should handle HTTP errors", async () => {
      global.process.env = { {UPPER_NAME}_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      }));

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow(SearchError);
      await expect(provider.search(query)).rejects.toThrow("HTTP 401 Unauthorized");
    });

    test("should handle network errors", async () => {
      global.process.env = { {UPPER_NAME}_API_KEY: "test-api-key" };

      global.fetch = mock(async () => {
        throw new Error("Network error: connection refused");
      });

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow(SearchError);
      await expect(provider.search(query)).rejects.toThrow("Network error");
    });

    test("should handle empty results", async () => {
      global.process.env = { {UPPER_NAME}_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({ results: [] }),
      }));

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow(SearchError);
      await expect(provider.search(query)).rejects.toThrow("returned no results");
    });
  });
});
```

## Key Patterns to Follow

### Extending BaseProvider

All providers extend `BaseProvider<T>` which provides:
- `id` property from config
- `isConfigured()` check for API keys
- `getMetadata()` for provider info
- `getApiKey()` validation
- `validateResults()` helper

### Error Handling

Use `fetchWithErrorHandling()` from `./utils` for all API calls:
- Automatically handles HTTP errors
- Times out requests
- Throws `SearchError` with proper context

### Result Mapping

Always map API responses to normalized format:
```typescript
{
  title: string;      // Required, fallback to URL or "Untitled"
  url: string;        // Required, empty string if missing
  snippet: string;    // Required, empty string if missing
  score?: number;     // Optional relevance score
  sourceEngine: string; // Provider ID
}
```

### Type Safety

- Define `{Provider}Config` interface extending `EngineConfigBase`
- Add `{Provider}ApiResponse` and `{Provider}Result` types
- Use Zod schema for runtime validation

## Testing Checklist

- [ ] Constructor initializes correctly
- [ ] Metadata returns expected values
- [ ] Successful search returns normalized results
- [ ] Raw response included when `includeRaw: true`
- [ ] Missing API key throws `SearchError`
- [ ] HTTP errors (401, 403, 429, 500) handled
- [ ] Network errors handled gracefully
- [ ] Empty results handled appropriately
- [ ] Result mapping handles missing/optional fields

## Example: Minimal Provider

For a simple GET-based provider, see `src/providers/brave.ts`.

For a POST-based provider with request body, see `src/providers/tavily.ts`.

For a Docker-based provider with lifecycle, see `src/providers/searchxng.ts`.
