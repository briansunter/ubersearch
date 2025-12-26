# Docker Auto-Start Feature

## Overview

The ubersearch tool now supports **automatic Docker container management** for local providers like SearXNG.

### Key Features

- ✅ **Auto-start**: Containers automatically start when first used
- ✅ **Health checks**: Wait for services to be ready before using them
- ✅ **Auto-stop**: Containers stop when process exits (configurable)
- ✅ **Graceful degradation**: Clear error messages if Docker unavailable
- ✅ **Zero-touch**: No manual `docker compose up` needed

## How It Works

### 1. Provider Initialization

When a Docker-based provider is called:

```typescript
// In orchestrator, before search()
await provider.init();
```

The `init()` method:

1. Checks if Docker is available
2. Checks if container is already running
3. If not running AND autoStart=true, starts container
4. Waits for health endpoint (if configured)
5. Marks provider as initialized

### 2. Auto-Start Process

```
User runs search → init() called → Docker check → Container start → Health wait → Search executes
     ⚠️                           ⚠️
     Docker not available        Start fails
     → Warning logged            → Error thrown
     → Search continues          → User sees error
     (if other providers)         → Graceful degradation
```

### 3. Health Checks

Containers must pass two health checks:

1. **Container running**: `docker compose ps` shows "Up"
2. **HTTP health endpoint**: GET to `/healthz` returns 200

If no health endpoint configured, just checks container status.

## Configuration

### Basic Auto-Start

```json
{
  "id": "searxng",
  "type": "searchxng",
  "enabled": true,
  "apiKeyEnv": "SEARXNG_API_KEY",
  "endpoint": "http://localhost:8888/search",

  "autoStart": true, // Start container if not running
  "autoStop": true, // Stop container on process exit
  "composeFile": "./providers/searxng/docker-compose.yml",
  "containerName": "searxng",
  "healthEndpoint": "http://localhost:8888/healthz",
  "initTimeoutMs": 60000 // 60 seconds max wait time
}
```

### Disable Auto-Start

To require manual startup:

```json
{
  "autoStart": false,
  "autoStop": false
}
```

### Custom Timeout

Adjust how long to wait for container:

```json
{
  "initTimeoutMs": 120000 // 2 minutes
}
```

## Usage Examples

### Example 1: SearXNG Auto-Start

**First search - container not running**:

```bash
$ bun run src/cli.ts "rust programming" --engines searxng

[searxng] Initializing provider...
[searxng] Starting Docker container...
[searxng] Starting searxng ... done
[searxng] Container started successfully.
[searxng] Waiting for health check...
[searxng] Health check passed.
[searxng] Search completed in 8.5s

Query: "rust programming"
Found 10 results

============================================================
searxng (10 results)
============================================================

1. Rust Programming Language
   https://rust-lang.org/
   Score: 0.95

2. The Rust Programming Language Book
   https://doc.rust-lang.org/book/
   Score: 0.92

Engine Status:
searxng         ✓ Success
```

**Second search - container already running**:

```bash
$ bun run src/cli.ts "test" --engines searxng

[searxng] Container is already running.

Query: "test"
Found 8 results

... results ...

Search completed in 0.8s
```

**Container automatically stopped on exit**:

```bash
# Process exits (Ctrl+C or normal exit)
[searxng] Stopping Docker container...
[searxng] Container stopped.
```

### Example 2: Docker Not Available

```bash
$ bun run src/cli.ts "test" --engines searxng

[searxng] Docker is not available. Cannot auto-start container.

Search failed: SearXNG container is not healthy. Check logs with: docker compose logs -f searxng
```

**But with multiple providers, continues**:

```bash
$ bun run src/cli.ts "test" --engines searxng,tavily

[searxng] Docker is not available. Cannot auto-start container.
⚠️  Search failed for searxng: provider_unavailable

Query: "test"
Found 5 results

============================================================
tavily (5 results)
============================================================

... results from Tavily ...

Engine Status:
searxng         ✗ Failed (provider_unavailable)
tavily          ✓ Success
```

## Advanced: Adding Auto-Start to Existing Providers

### Step 1: Create Docker Compose

```yaml
# providers/ollama/docker-compose.yml
version: "3.8"

services:
  ollama:
    image: ollama/ollama:latest
    container_name: ubersearch-ollama
    ports:
      - "11434:11434"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:11434/api/tags"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
```

### Step 2: Create Provider

```typescript
// src/providers/ollama.ts

import { DockerProvider } from "../core/provider/dockerProvider";
import type { SearchQuery, SearchResponse } from "../core/types";

export class OllamaProvider extends DockerProvider {
  // ... implementation ...

  async search(query: SearchQuery): Promise<SearchResponse> {
    await this.init(); // Auto-starts container if needed

    // Container is now running, proceed with search
    const response = await fetch(`${this.config.apiUrl}/api/generate`, {
      method: "POST",
      body: JSON.stringify({
        model: "llama2",
        prompt: query.query,
      }),
    });

    // ... handle response ...
  }
}
```

### Step 3: Configure

```json
{
  "id": "ollama",
  "type": "searchxng", // or new type if you define it
  "enabled": true,
  "apiKeyEnv": "OLLAMA_API_KEY",
  "endpoint": "http://localhost:11434/api/generate",

  "autoStart": true,
  "autoStop": true,
  "composeFile": "./providers/ollama/docker-compose.yml",
  "containerName": "ollama",
  "healthEndpoint": "http://localhost:11434/api/tags",
  "initTimeoutMs": 120000 // Give Ollama time to load models
}
```

## Architecture

### Component Interaction

```
┌─────────────────┐          ┌──────────────────┐          ┌────────────────┐
│   CLI Command   │          │     Provider     │          │ Docker Compose │
│  "ubersearch" │─────────▶│   Searchxng      │─────────▶│   Container    │
└─────────────────┘          └────────┬─────────┘          └───────┬────────┘
                                      │                           │
                                      │ init()                    │
                                      │  ┌────────────────────┐  │
                                      │  │ Check Docker       │  │
                                      │  │ Is container up?   │  │
                                      │  └────────────────────┘  │
                                      │           │              │
                                      │     ┌─────┴──────┐       │
                                      │     │   No       │       │
                                      │     └─────┬──────┘       │
                                      │           ▼              │
                                      │  ┌────────────────────┐  │
                                      │  │  docker compose up │──▶│
                                      │  └────────────────────┘  │
                                      │           │              │
                                      │  ┌────────▼───────┐      │
                                      │  │ Wait for health│      │
                                      │  └────────────────┘      │
                                      └───────────┬──────────────┘
                                                  ▼
                                      ┌────────────────────────┐
                                      │  Container is ready    │
                                      │  Execute search()      │
                                      └────────────────────────┘
```

### Lifecycle Flow

```typescript
// User search
await uberSearch({ query: "test", engines: ["searxng"] });

// In orchestrator
const provider = registry.get("searxng");
await provider.init(); // Auto-starts if needed

// In provider.init()
if (!this.isInitialized()) {
  await this.performInit();
}

// performInit()
if (this.dockerHelper) {
  const running = await this.dockerHelper.isRunning();
  if (!running && this.config.autoStart) {
    await this.dockerHelper.up();
    await this.waitForHealth();
  }
}

// Back to search
const result = await provider.search(query);
return result;
```

## Error Handling

### Docker Not Available

```
Error: Docker is not available. Cannot auto-start container.
Action: Install Docker Desktop or start Docker daemon
Fallback: Other providers continue working
```

### Container Start Failed

```
Error: Failed to start container: port 8888 already in use
Action: Free the port or use a different one
Log: View logs with 'docker compose logs -f searxng'
```

### Health Check Timeout

```
Error: Health check failed after 60000ms
Action: Check container logs, ensure service starts properly
Cause: Slow startup, missing config, resource constraints
```

## Performance

### First Search (Cold Start)

- Docker start: ~30 seconds
- Health check wait: ~5-10 seconds
- Container ready: ~35-40 seconds total
- First search: ~8-10 seconds (includes init)

### Subsequent Searches

- Provider already initialized: ~0.5-1 second
- Container already running: ~0.5-1 second

### Resource Usage

- Memory: ~300MB per SearXNG container
- CPU: Minimal when idle
- Disk: ~100MB for images
- Network: Only during searches

## Production Considerations

### ✅ Best Practices

1. **Use autoStart in development**: Fast iteration
2. **Use autoStop in development**: Save resources
3. **Set appropriate timeouts**: 60s for SearXNG, more for large models
4. **Monitor disk space**: Docker images can accumulate
5. **Health endpoint**: Always configure if available
6. **Container naming**: Use unique names for multiple instances

### ⚠️ Warnings

1. **Container startup time**: First search will be slow
2. **Resource usage**: Self-hosted models use significant memory
3. **Disk space**: Docker images and volumes grow over time
4. **Port conflicts**: Ensure ports are available
5. **Docker daemon**: Required for auto-start to work

## Troubleshooting

### Container Won't Start

```bash
# Check Docker is running
docker version

# Check logs
cd providers/searxng
docker compose logs -f

# Check port availability
lsof -i :8888

# Clean up
docker system prune -a
```

### Container Starts But Health Check Fails

```bash
# Check container status
docker compose ps

# Check logs
docker compose logs searxng

# Test endpoint manually
curl http://localhost:8888/healthz

# Check error message
# Common: config error, port already in use, resource constraints
```

### Auto-Start Not Working

```bash
# Verify config is loaded
cat ubersearch.config.json | grep -A 10 searxng

# Check autoStart is true
# Should see: "autoStart": true

# Verify compose file exists
ls -la providers/searxng/docker-compose.yml
```

## Comparison: Auto-Start vs Manual

| Aspect             | Auto-Start              | Manual                      |
| ------------------ | ----------------------- | --------------------------- |
| **Dev Experience** | 🟢 Seamless             | 🟡 Requires manual steps    |
| **First search**   | 35-40s (includes start) | 0.5-1s (if already running) |
| **Resource usage** | Auto-stops when done    | Manual cleanup needed       |
| **Setup**          | One config line         | Remember to start/stop      |
| **Error handling** | Automatic retries       | Manual debugging            |
| **Best for**       | Development, casual use | Production, always-on       |

## Configuration Reference

### Full Configuration Options

```typescript
interface DockerProviderConfig {
  // Basic info
  id: string;
  displayName: string;
  apiKeyEnv: string;

  // Search endpoint
  endpoint: string;

  // Docker settings
  composeFile?: string; // Path to docker-compose.yml
  containerName?: string; // Specific service name
  healthEndpoint?: string; // HTTP health check URL

  // Auto-management
  autoStart?: boolean; // Start container if not running (default: false)
  autoStop?: boolean; // Stop container on exit (default: false)
  initTimeoutMs?: number; // Max wait time (default: 30000)

  // Credit management
  monthlyQuota: number;
  creditCostPerSearch: number;
  lowCreditThresholdPercent: number;
}
```

### Quick Reference

```json
{
  "autoStart": true, // Enable auto-start
  "autoStop": true, // Enable auto-stop
  "composeFile": "./path/to/docker-compose.yml",
  "containerName": "service-name",
  "healthEndpoint": "http://localhost:port/health",
  "initTimeoutMs": 60000 // 60 seconds
}
```

## Future Enhancements

Potential improvements:

1. **Parallel initialization**: Start all Docker providers simultaneously
2. **Background start**: Don't block first search, show "starting" indicator
3. **Docker Desktop integration**: Check if Docker Desktop is installed
4. **Volume management**: Auto-clean old images/volumes
5. **Port conflict detection**: Suggest alternative ports
6. **GPU support**: Auto-detect and pass GPU to containers
7. **Resource limits**: Auto-configure memory/CPU limits
8. **Auto-update**: Pull latest images periodically

---

## Summary

Docker auto-start provides a seamless experience for local providers:

✅ **Zero-configuration**: Containers start automatically
✅ **Transparent**: Users don't need to know about Docker
✅ **Efficient**: Auto-stops to save resources
✅ **Reliable**: Health checks ensure services are ready
✅ **Flexible**: Configure per provider as needed

The feature is particularly valuable for SearXNG, enabling privacy-focused search without manual Docker management.
