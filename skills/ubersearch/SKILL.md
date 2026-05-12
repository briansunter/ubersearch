---
name: ubersearch
description: Unified web search CLI and MCP server across Tavily, Brave, Linkup, and SearXNG. Use when searching the web, researching topics, checking provider health or credits, or configuring multi-provider search strategies.
keywords: [search, web, tavily, brave, searxng, linkup, research, mcp, credits, health]
topics: [search, research, web, mcp]
---

# UberSearch

Unified search CLI + MCP server across Tavily, Brave, Linkup, and SearXNG with credit tracking, pluggable strategies, and Docker-managed SearXNG.

## Providers

| Provider | ID | Free Tier | Notes |
|----------|----|-----------|-------|
| Tavily | `tavily` | 1,000/mo | AI-optimized, high relevance |
| Brave | `brave` | 2,000/mo | Privacy-focused web search |
| Linkup | `linkup` | 1,000/mo | AI-powered search |
| SearXNG | `searxng` | Unlimited | Self-hosted metasearch, Docker auto-managed |

## MCP Tools

### uber_search
Primary search tool.

**Parameters:**
- `query` (required): Search query
- `engines` (optional): Comma-separated provider IDs, e.g. `"tavily,brave"`
- `strategy` (optional): `"all"` or `"first-success"` (default: `"first-success"`)
- `limit` (optional): Max results per engine
- `categories` (optional): SearXNG category filter (see below)

### uber_search_credits
Show credit balance and usage for all configured providers.

### uber_search_health
Run health checks on all providers. Auto-starts Docker-backed providers (SearXNG) if needed.

## CLI

```bash
ubersearch "your query"                        # Search (first-success strategy)
ubersearch "query" --engines tavily,brave      # Specific providers
ubersearch "query" --strategy all              # Merge results from all providers
ubersearch "query" --json                      # JSON output
ubersearch "query" --include-raw               # Include raw provider responses
ubersearch "query" --limit 5                   # Max results per engine
ubersearch "query" --categories it,science     # SearXNG category filter

ubersearch credits                             # Check credit status
ubersearch health                              # Provider health checks
ubersearch mcp                                 # Start MCP server (stdio)
```

## Strategies

- **`first-success`** (default): Stop after first provider returns results. Best for quick lookups.
- **`all`**: Query all enabled providers and merge results. Best for comprehensive research.

## SearXNG Categories

Filter SearXNG results by domain:

| Category | Sources |
|----------|---------|
| `general` | brave, duckduckgo, startpage |
| `it` | github, stackoverflow, npm, pypi, huggingface |
| `science` | arxiv, google_scholar |
| `news` | hackernews, reddit, bbc |
| `videos` | youtube |

Pass multiple: `--categories it,science`

## MCP Server Setup

Add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ubersearch": {
      "command": "bunx",
      "args": ["--bun", "ubersearch", "mcp"],
      "env": {
        "TAVILY_API_KEY": "tvly-...",
        "BRAVE_API_KEY": "BSA...",
        "LINKUP_API_KEY": "linkup..."
      }
    }
  }
}
```

Restart Claude Desktop after editing. The server communicates over stdio using JSON-RPC.

## Configuration

Config resolution order:
1. `--config /path/to/config.json` (CLI flag)
2. `./ubersearch.config.ts` or `./ubersearch.config.json` (cwd)
3. `$XDG_CONFIG_HOME/ubersearch/config.ts` or `.json`

TypeScript configs use the `defineConfig` helper for type safety. JSON configs validate against `config.schema.json`.

**Key options:**
- `defaultEngineOrder`: Provider IDs to try in order
- `engines`: Per-engine configuration (API key env var names, limits)
- `plugins`: Custom provider plugins
- `storage.creditStatePath`: Path for credit tracking state

## Plugin System

Extend with custom providers using `definePlugin`:

```ts
import { definePlugin } from "ubersearch";

export default definePlugin({
  id: "my-provider",
  name: "My Provider",
  register(registry) {
    registry.registerProvider({
      id: "my-provider",
      search: async (query, options) => { /* ... */ },
    });
  },
});
```

Reference plugins in config: `plugins: ["./my-plugin.ts"]`
