---
name: search-health
description: Run health checks on search providers
---

# Search Provider Health Check

Run health checks on all configured search providers.

## Usage

### Via MCP Tool
```
uber_search_health()
```

### Via CLI
```bash
bunx ubersearch health
```

## Output

Returns health status for each provider:
- **healthy**: Provider is responding normally
- **unhealthy**: Provider is not responding (includes error message)
- **skipped**: Provider does not support health checks

For Docker-backed providers (like SearXNG), this will attempt to start the container if needed.
