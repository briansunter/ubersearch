---
name: search
description: Search the web using UberSearch unified interface
---

# Web Search

Execute a web search using UberSearch's unified multi-provider interface.

## Usage

When the user asks to search the web, use the `uber_search` MCP tool or CLI:

### Via MCP Tool
```
uber_search(query: "search query", engines: "tavily,brave", strategy: "all", limit: 10)
```

### Via CLI
```bash
bunx ubersearch "search query" --engines tavily,brave --json
```

## Parameters

- **query**: The search query (required)
- **engines**: Comma-separated list of providers (optional, defaults to all enabled)
- **strategy**: "all" to query all engines, "first-success" for fastest result
- **limit**: Maximum results per engine (default: 10)
- **categories**: SearXNG categories for targeted results

## Examples

1. General web search:
   ```bash
   bunx ubersearch "best typescript frameworks 2025" --json
   ```

2. Tech-focused search with SearXNG:
   ```bash
   bunx ubersearch "rust async patterns" --categories it --json
   ```

3. Quick lookup (first provider to respond):
   ```bash
   bunx ubersearch "current weather tokyo" --strategy first-success
   ```
