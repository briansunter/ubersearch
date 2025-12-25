# Example: Adding a Local Embedding Provider

This guide shows step-by-step how to add a local Docker-based embedding provider to ai-search using the improved abstraction.

## Overview

We'll create a provider that runs a local sentence transformer model in Docker to provide embeddings for semantic search.

## Step 1: Create Docker Compose File

```yaml
# providers/local/embedding/docker-compose.yml

version: "3.8"

services:
  embedding-service:
    image: ghcr.io/anthropics/embedding-service:latest
    container_name: ai-search-embedding
    ports:
      - "8000:8000"
    environment:
      - MODEL_NAME=all-MiniLM-L6-v2
      - BATCH_SIZE=32
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    restart: unless-stopped
```

## Step 2: Implement the Provider

```typescript
// src/providers/local/embedding.ts

import { DockerProvider } from "./dockerBase";
import type { SearchQuery, SearchResponse } from "../../core/types";
import type { EmbeddingProviderConfig } from "../../config/types";
import { SearchError } from "../../core/types";

export class LocalEmbeddingProvider extends DockerProvider {
  private apiUrl: string;
  private modelName: string;

  constructor(config: EmbeddingProviderConfig) {
    super({
      id: config.id,
      containerName: config.containerName,
      composeFile: config.composeFile,
      healthEndpoint: config.healthEndpoint,
    });

    this.apiUrl = config.apiUrl;
    this.modelName = config.modelName;
  }

  async search(query: SearchQuery): Promise<SearchResponse> {
    // Ensure container is running
    const isHealthy = await this.healthcheck();
    if (!isHealthy) {
      throw new SearchError(
        this.id,
        "provider_unavailable",
        "Embedding service is not healthy. Run: ai-search providers init",
      );
    }

    const started = Date.now();

    // Call embedding API
    const response = await fetch(`${this.apiUrl}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: query.query,
        limit: query.limit ?? 10,
        model: this.modelName,
      }),
    });

    if (!response.ok) {
      throw new SearchError(
        this.id,
        "api_error",
        `Embedding API error: HTTP ${response.status}`,
        response.status,
      );
    }

    const data = await response.json();

    return {
      engineId: this.id,
      items: data.results.map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
        score: r.score, // Semantic similarity score
        sourceEngine: this.id,
      })),
      tookMs: Date.now() - started,
    };
  }

  getMetadata() {
    return {
      id: this.id,
      displayName: this.metadata.displayName,
      docsUrl: "https://github.com/anthropics/embedding-service",
    };
  }
}
```

## Step 3: Register the Provider

```typescript
// src/bootstrap/providers.ts

import { LocalEmbeddingProvider } from "../providers/local/embedding";

export function buildProviderRegistry(
  config: SearchXngConfig,
): ProviderRegistry {
  const registry = new ProviderRegistry();

  for (const engineConfig of config.engines) {
    if (!engineConfig.enabled) continue;

    try {
      let provider: SearchProvider;

      switch (engineConfig.type) {
        case "tavily":
          provider = new TavilyProvider(engineConfig);
          break;

        case "brave":
          provider = new BraveProvider(engineConfig);
          break;

        case "linkup":
          provider = new LinkupProvider(engineConfig);
          break;

        case "docker":
          if (engineConfig.serviceType === "embedding") {
            provider = new LocalEmbeddingProvider(engineConfig);
          } else {
            throw new Error(
              `Unknown docker service type: ${engineConfig.serviceType}`,
            );
          }
          break;

        default:
          console.warn(
            `Unsupported engine type: ${(engineConfig as any).type}`,
          );
          continue;
      }

      registry.register(provider);
    } catch (error) {
      console.warn(`Failed to register provider ${engineConfig.id}:`, error);
    }
  }

  return registry;
}
```

## Step 4: Add Configuration Type

```typescript
// src/config/types.ts

export interface EmbeddingProviderConfig extends DockerProviderConfig {
  type: "docker";
  serviceType: "embedding";
  modelName: string; // e.g., 'all-MiniLM-L6-v2'
}

// Update union type
export type EngineConfig =
  | TavilyConfig
  | BraveConfig
  | LinkupConfig
  | EmbeddingProviderConfig;
```

## Step 5: Add to Configuration

```json
{
  "defaultEngineOrder": ["local-embeddings", "tavily"],
  "engines": [
    {
      "id": "local-embeddings",
      "type": "docker",
      "serviceType": "embedding",
      "enabled": true,
      "displayName": "Local Embeddings",
      "containerName": "ai-search-embedding",
      "composeFile": "./providers/local/embedding/docker-compose.yml",
      "healthEndpoint": "http://localhost:8000/health",
      "apiUrl": "http://localhost:8000",
      "modelName": "all-MiniLM-L6-v2",
      "autoStart": true,
      "autoStop": true,
      "monthlyQuota": 10000,
      "creditCostPerSearch": 0,
      "lowCreditThresholdPercent": 0
    },
    {
      "id": "tavily",
      "type": "tavily",
      "enabled": true,
      "displayName": "Tavily Search",
      "apiKeyEnv": "TAVILY_API_KEY",
      "endpoint": "https://api.tavily.com/search",
      "searchDepth": "basic",
      "monthlyQuota": 1000,
      "creditCostPerSearch": 1,
      "lowCreditThresholdPercent": 80
    }
  ]
}
```

## Step 6: Add CLI Wrapper (Optional)

```bash
#!/bin/bash
# bin/setup-local-embedding

echo "Setting up local embedding provider..."

# Create providers directory structure
mkdir -p providers/local/embedding

# Copy docker-compose.yml template
cat > providers/local/embedding/docker-compose.yml << 'EOF'
version: '3.8'
services:
  embedding-service:
    image: ghcr.io/anthropics/embedding-service:latest
    container_name: ai-search-embedding
    ports:
      - "8000:8000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    restart: unless-stopped
EOF

echo "Docker Compose file created: providers/local/embedding/docker-compose.yml"
echo ""
echo "Install with: ai-search providers init"
echo "Search with: ai-search 'your query'"
```

## Step 7: Test the Implementation

### Test 1: Initialize Provider

```bash
bun run src/cli.ts providers init

# Expected output:
# Initializing local-embeddings...
# Starting Docker container: ai-search-embedding
# Container started successfully
```

### Test 2: Run Health Check

```bash
bun run src/cli.ts providers health

# Expected output:
# Provider Health Status
# ============================================================
# tavily          ✓ Healthy
# local-embeddings ✓ Healthy
```

### Test 3: Run a Search

```bash
bun run src/cli.ts "semantic search is powerful" --engines local-embeddings --limit 3

# Expected output:
# Query: "semantic search is powerful"
# Found 3 results
#
# ============================================================
# local-embeddings (3 results)
# ============================================================
#
# 1. Understanding Semantic Search
#    https://example.com/semantic-search
#    Score: 0.9234
#    Semantic search uses vector embeddings to find...
```

### Test 4: Check Credit Usage

```bash
bun run src/cli.ts credits

# Expected output:
# local-embeddings
#   Used:      1 / 10000 (0.0%)
#   Remaining: 9999
#   Status:    ✓ OK
#
# tavily
#   Used:      0 / 1000 (0.0%)
#   Remaining: 1000
```

### Test 5: Shutdown Provider

```bash
bun run src/cli.ts providers stop

# Expected output:
# Stopping Docker container: ai-search-embedding
```

## Step 8: Add Tests

```typescript
// src/providers/local/embedding.test.ts

import { describe, test, expect } from "bun:test";
import { LocalEmbeddingProvider } from "./embedding";

describe("LocalEmbeddingProvider", () => {
  test("should initialize and run healthcheck", async () => {
    const provider = new LocalEmbeddingProvider({
      id: "test-embedding",
      type: "docker",
      serviceType: "embedding",
      enabled: true,
      displayName: "Test Embeddings",
      containerName: "test-embedding",
      composeFile: "./docker-compose.test.yml",
      healthEndpoint: "http://localhost:8001/health",
      apiUrl: "http://localhost:8001",
      modelName: "test-model",
      autoStart: false, // Don't auto-start in tests
      autoStop: true,
      monthlyQuota: 1000,
      creditCostPerSearch: 0,
      lowCreditThresholdPercent: 0,
    });

    // Test healthcheck when container is down
    const isHealthy = await provider.healthcheck();
    expect(isHealthy).toBe(false);
  });

  test("should validate configuration", async () => {
    const provider = new LocalEmbeddingProvider({
      id: "test-embedding",
      type: "docker",
      serviceType: "embedding",
      enabled: true,
      displayName: "Test Embeddings",
      containerName: "test-embedding",
      composeFile: "./nonexistent.yml",
      healthEndpoint: "http://localhost:8001/health",
      apiUrl: "http://localhost:8001",
      modelName: "test-model",
      autoStart: false,
      autoStop: true,
      monthlyQuota: 1000,
      creditCostPerSearch: 0,
      lowCreditThresholdPercent: 0,
    });

    const validation = await provider.validateConfig();
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });
});
```

## Advanced: Support Multiple Local Models

### Multi-Model Configuration

```json
{
  "defaultEngineOrder": ["local-minilm", "local-e5", "tavily"],
  "engines": [
    {
      "id": "local-minilm",
      "type": "docker",
      "serviceType": "embedding",
      "enabled": true,
      "displayName": "Local MiniLM",
      "containerName": "ai-search-minilm",
      "composeFile": "./providers/local/minilm/docker-compose.yml",
      "healthEndpoint": "http://localhost:8001/health",
      "apiUrl": "http://localhost:8001",
      "modelName": "all-MiniLM-L6-v2",
      "autoStart": true,
      "autoStop": true,
      "monthlyQuota": 10000,
      "creditCostPerSearch": 0
    },
    {
      "id": "local-e5",
      "type": "docker",
      "serviceType": "embedding",
      "enabled": true,
      "displayName": "Local E5",
      "containerName": "ai-search-e5",
      "composeFile": "./providers/local/e5/docker-compose.yml",
      "healthEndpoint": "http://localhost:8002/health",
      "apiUrl": "http://localhost:8002",
      "modelName": "intfloat/e5-base-v2",
      "autoStart": true,
      "autoStop": true,
      "monthlyQuota": 10000,
      "creditCostPerSearch": 0
    }
  ]
}
```

### Compare Results from Different Models

```bash
# Search with MiniLM (faster, smaller)
ai-search "query" --engines local-minilm

# Search with E5 (better quality, slower)
ai-search "query" --engines local-e5

# Compare both
ai-search "query" --engines local-minilm,local-e5 --json
```

## Troubleshooting

### Container fails to start

```bash
# Check Docker is running
docker version

# Check compose file
docker compose -f providers/local/embedding/docker-compose.yml config

# Check logs
ai-search providers logs embedding-service

# Or manually
docker compose -f providers/local/embedding/docker-compose.yml logs
```

### Health check fails

```bash
# Check if container is running
docker ps | grep ai-search-embedding

# Check health
ai-search providers health

# Test endpoint manually
curl http://localhost:8000/health

# Check port is available
netstat -an | grep 8000
```

### Search returns no results

```bash
# Check provider health
ai-search providers health

# Verify API is accessible
curl -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "limit": 3}'

# Check configuration
ai-search providers validate local-embeddings
```

## Best Practices

### 1. Use appropriate models for your use case

- **MiniLM**: Fast, good for general search (384 dims)
- **E5**: Better quality, multilingual (768-1024 dims)
- **MPNet**: Best quality, slower (768 dims)

### 2. Resource management

- Set appropriate `autoStop: true` for development
- Use `autoStop: false` in production if service is shared
- Monitor memory usage with large models

### 3. Configuration

- Use `creditCostPerSearch: 0` for local models
- Set high `monthlyQuota` (no real limit for local)
- Configure `lowCreditThresholdPercent: 0` (no warnings needed)

### 4. Testing

- Always run `providers init` before first use
- Run `providers health` to verify setup
- Use `providers logs` for debugging

## Summary

This example demonstrates:

- ✅ Creating a Docker-based local provider
- ✅ Extending the DockerProvider base class
- ✅ Registering with the provider registry
- ✅ Configuring auto-start/stop behavior
- ✅ Running health checks
- ✅ Credit management integration

**Total time to implement**: ~30 minutes
**Complexity**: Medium
**Flexibility**: High - can support any Docker-based service
