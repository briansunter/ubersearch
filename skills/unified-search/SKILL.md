---
name: Unified Search
description: Search across multiple providers (Tavily, Brave, Linkup, SearXNG) with unified results, credit tracking, and configurable strategies. Use when performing web searches requiring comprehensive or provider-specific results.
keywords: [search, web, tavily, brave, searxng, linkup, research]
topics: [search, research, web]
---

# Unified Search with UberSearch

UberSearch provides a unified interface for searching across multiple providers with credit tracking and pluggable strategies.

## Available Providers

- **Tavily**: AI-focused search with high relevance
- **Brave**: Privacy-focused web search
- **Linkup**: Alternative search provider
- **SearXNG**: Self-hosted metasearch (supports Docker auto-start)

## MCP Tools

Use the MCP tools for programmatic access:

### uber_search
Primary search tool with options:
- `query`: Search query (required)
- `engines`: Comma-separated providers (e.g., "tavily,brave")
- `strategy`: "all" (merge results) or "first-success" (fastest provider)
- `limit`: Max results per engine
- `categories`: SearXNG categories (general, it, science, news, videos)

### uber_search_credits
Check credit status for all configured engines.

### uber_search_health
Run health checks on all providers.

## CLI Usage

```bash
# Basic search
ubersearch "your search query"

# Specific engines
ubersearch "query" --engines tavily,brave

# JSON output
ubersearch "query" --json

# First-success strategy (stop after first working provider)
ubersearch "query" --strategy first-success

# Check credits
ubersearch credits

# Health check
ubersearch health
```

## Search Strategies

### All (default)
Queries all enabled providers and merges results. Best for comprehensive research.

### First-Success
Stops after the first provider returns results. Best for quick lookups.

## SearXNG Categories

When using SearXNG, specify categories for targeted results:
- `general`: Web search (brave, duckduckgo, startpage)
- `it`: Tech (github, stackoverflow, npm, pypi, huggingface)
- `science`: Academic (arxiv, google_scholar)
- `news`: News (hackernews, reddit, bbc)
- `videos`: Video (youtube)

Example: `--categories it,science` for tech and academic results.

## Configuration

Config resolution order:
1. Explicit path (`--config /path/to/config.json`)
2. `./ubersearch.config.(ts|json)` (current directory)
3. `$XDG_CONFIG_HOME/ubersearch/config.(ts|json)`

## Best Practices

1. **Use appropriate strategy**: "all" for research, "first-success" for quick lookups
2. **Monitor credits**: Run `ubersearch credits` periodically
3. **Leverage categories**: Use SearXNG categories for domain-specific searches
4. **Check health**: Run health checks before important searches
