# UberSearch

Unified, Bun-first search interface across multiple providers with credit tracking, pluggable strategies, and optional Docker-managed SearXNG.

## Highlights

- 🔍 Providers: Tavily, Brave, Linkup, SearXNG (local, Docker auto-start)
- 🔌 Extensible: Add custom providers via TypeScript plugin system
- 🤝 Single interface: shared types + CLI + programmatic API
- 💳 Credits: per-engine quotas with snapshots and low-credit warnings
- 🧠 Strategies: `all` (merge) or `first-success` (fastest win)
- ⚙️ Config: JSON or TypeScript (`defineConfig`), XDG-aware resolution
- 🐳 Auto-start: optional Docker lifecycle for local SearXNG

## Install & Run (Bun)

```bash
cd /path/to/ubersearch
bun install

# CLI (direct)
bun run src/cli.ts "best TypeScript ORM 2025"

# Or use bun link (works from any directory)
bun link
ubersearch "llm observability" --json
```

## Usage

### Basic Search

```bash
ubersearch "your search query"
```

### MCP Server (Claude Desktop)

Start the MCP server for Claude Desktop integration:

```bash
ubersearch mcp
```

Add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ubersearch": {
      "command": "bunx",
      "args": ["--bun", "ubersearch", "mcp"],
      "env": {
        "TAVILY_API_KEY": "your_key",
        "BRAVE_API_KEY": "your_key"
      }
    }
  }
}
```

See `docs/MCP_SERVER.md` for full MCP documentation.

### Options

```bash
ubersearch "query" [options]

Options:
  --json                        Output results as JSON
  --engines engine1,engine2     Use specific engines
  --strategy all|first-success  Search strategy (default: all)
  --limit number                Max results per engine
  --include-raw                 Include raw provider responses
  --help, -h                    Show help
  health                        Run provider health checks (starts Docker-backed ones if needed)
```

### Examples

```bash
# Search with specific engines
ubersearch "hawaii dev meetups" --engines tavily,brave --json

# Use first-success strategy (stop after first working provider)
ubersearch "emerging web frameworks" --strategy first-success

# Limit results per provider
ubersearch "rust async patterns" --limit 3

# Check credit status
ubersearch credits
```

## Configuration

Resolution order (first wins):
1. Explicit path passed to CLI/API (`--config /path/to/config.json`)
2. `./ubersearch.config.(ts|json)` (current directory)
3. `$XDG_CONFIG_HOME/ubersearch/config.(ts|json)` (default: `~/.config/ubersearch/`)

### XDG Directory Structure

```
~/.config/ubersearch/
├── config.json              # Main configuration
└── searxng/
    └── config/
        └── settings.yml     # SearXNG settings (auto-copied on first run)

~/.local/share/ubersearch/
└── searxng/
    └── data/                # SearXNG cache (auto-created)
```

- Example config: see `docs/config/ubersearch.config.json`
- Schema: `docs/config/config.schema.json` (generated from Zod)
- TS helper: `defineConfig`, `defineTavily`, `defineBrave`, `defineLinkup`, `defineSearchxng`

### SearXNG Configuration

SearXNG uses Docker with volumes mounted to XDG directories. On first run, the default `settings.yml` is copied to `~/.config/ubersearch/searxng/config/`. You can customize this file to:
- Enable/disable search engines
- Adjust rate limiting
- Configure output formats

## Custom Providers

Add your own search providers using the plugin system.

### TypeScript Config with Custom Provider

```typescript
// ~/.config/ubersearch/config.ts
import { defineConfig, definePlugin } from "ubersearch/config";

// 1. Define your provider class
class PerplexityProvider {
  constructor(private config: any) {}

  get id() { return this.config.id; }

  async search(query: { query: string; limit?: number }) {
    const response = await fetch("https://api.perplexity.ai/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env[this.config.apiKeyEnv]}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: query.query }),
    });
    const data = await response.json();

    return {
      engineId: this.id,
      items: data.results.map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
        sourceEngine: this.id,
      })),
    };
  }
}

// 2. Create the plugin
const perplexityPlugin = definePlugin({
  type: "perplexity",
  displayName: "Perplexity AI",
  hasLifecycle: false,
  factory: (config) => new PerplexityProvider(config),
});

// 3. Export config with plugin
export default defineConfig({
  plugins: [perplexityPlugin],
  defaultEngineOrder: ["perplexity", "searxng"],
  engines: [
    {
      id: "perplexity",
      type: "perplexity",  // matches plugin type
      enabled: true,
      apiKeyEnv: "PERPLEXITY_API_KEY",
      endpoint: "https://api.perplexity.ai/search",
      monthlyQuota: 1000,
      creditCostPerSearch: 1,
      lowCreditThresholdPercent: 10,
    },
    // ... other engines
  ],
});
```

### Provider Interface

Your provider must implement:

```typescript
interface ISearchProvider {
  id: string;
  search(query: SearchQuery): Promise<SearchResponse>;
}

interface SearchQuery {
  query: string;
  limit?: number;
  includeRaw?: boolean;
}

interface SearchResponse {
  engineId: string;
  items: SearchResultItem[];
  raw?: unknown;
  tookMs?: number;
}

interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  score?: number;
  sourceEngine: string;
}
```

### Plugin Helpers

- `definePlugin({ type, displayName, hasLifecycle, factory })` - Create a plugin
- `defineConfig({ plugins, engines, ... })` - Config with plugins
- `defineEngine<T>(config)` - Type-safe custom engine config

## Architecture (short)

- Config resolved and validated (`src/config`), plugins registered
- DI container bootstraps orchestrator, credit manager, provider registry (`src/bootstrap/container.ts`)
- Providers registered via plugins (`src/plugin`, `src/providers/*`)
- Orchestrator runs strategies (`src/core/strategy/*`) and aggregates results
- Docker-backed providers (SearXNG) use lifecycle manager with auto-start/health checks (`src/core/docker/*`)

## Output Formats

### Human-Readable (Default)

```
Query: "rust async patterns"
Found 15 results

============================================================
tavily (10 results)
============================================================

1. Async programming in Rust - Tokio
   https://tokio.rs/
   Score: 0.95
   Tokio is a runtime for writing reliable asynchronous applications with Rust.

2. Asynchronous Programming in Rust
   https://rust-lang.github.io/async-book/
   Score: 0.92
   A book explaining async/await in Rust...
```

### JSON (`--json`)

```json
{
  "query": "rust async patterns",
  "items": [
    {
      "title": "Async programming in Rust - Tokio",
      "url": "https://tokio.rs/",
      "snippet": "Tokio is a runtime...",
      "score": 0.95,
      "sourceEngine": "tavily"
    }
  ],
  "enginesTried": [
    {
      "engineId": "tavily",
      "success": true
    }
  ],
  "credits": [...]
}
```

## Search Strategies

### All (Default)

Queries all configured/enabled providers and combines results.

```bash
ubersearch "topic" --strategy all
```

- Pro: Gets maximum coverage, see different perspectives
- Con: Uses more credits, slower
- Best for: Research, comparison, getting API formats

### First Success

Stops after the first provider returns results.

```bash
ubersearch "topic" --strategy first-success
```

- Pro: Saves credits, faster
- Con: Misses results from other providers
- Best for: Quick lookups, production use

## Development

### Source layout

```
src/
├── app/                  # Public surface (bootstrap + API exports)
├── bootstrap/            # DI container wiring
├── config/               # Config types, schema, loaders
├── core/                 # Orchestrator, strategy, credits, docker helpers
│   ├── docker/           # Docker compose helper, lifecycle manager
│   ├── paths.ts          # XDG path utilities
│   └── ...
├── plugin/               # Plugin registry and built-ins
├── providers/            # Provider implementations + shared helpers
├── tool/                 # CLI-facing tool + interfaces
└── cli.ts                # CLI entry

providers/
└── searxng/
    ├── docker-compose.yml  # SearXNG Docker config (uses env var volumes)
    └── config/
        └── settings.yml    # Default SearXNG settings (copied to XDG on first run)
```

### Building

```bash
# Bundle to dist/
bun run build

# Creates:
# dist/cli.js              - Bundled CLI
# dist/providers/searxng/  - Docker compose + default settings
```

### Testing (Bun)

- All: `SKIP_DOCKER_TESTS=true bun test --preload ./test/setup.ts test/`
- Unit only: `bun run test:unit`
- Integration (Docker optional): `SKIP_DOCKER_TESTS=false bun run test:integration`
- Coverage: `SKIP_DOCKER_TESTS=true bun run test:coverage`

See `docs/testing/README.md` for suite layout.

## Troubleshooting

- **Missing config**: Copy `docs/config/ubersearch.config.json` to `~/.config/ubersearch/config.json`
- **Missing API key**: Set `TAVILY_API_KEY`, `BRAVE_API_KEY`, `LINKUP_API_KEY` environment variables
- **SearXNG not healthy**: Ensure Docker is running. Check `~/.config/ubersearch/searxng/config/settings.yml` exists
- **SearXNG settings missing**: Run `ubersearch health` once to bootstrap default config to XDG directory
- **Path issues after bun link**: The CLI resolves paths relative to XDG directories, not the working directory

## Providers

| Provider | Type | API Key Required | Free Tier | Notes |
|----------|------|------------------|-----------|-------|
| **SearXNG** | `searchxng` | No | Unlimited (local) | Self-hosted, Docker auto-start |
| **Tavily** | `tavily` | Yes | 1000/month | Best for AI/research queries |
| **Brave** | `brave` | Yes | 2000/month | General web search |
| **Linkup** | `linkup` | Yes | 1000/month | AI-powered search |

### Getting API Keys

- **Tavily**: https://tavily.com/ → Sign up → Dashboard → API Keys
- **Brave**: https://brave.com/search/api/ → Get Started → Create App
- **Linkup**: https://linkup.so/ → Sign up → API Keys
- **SearXNG**: No key needed (runs locally via Docker)

## Environment Variables

### API Keys (required per enabled engine)

```bash
# Add to ~/.bashrc, ~/.zshrc, or use a secrets manager
export TAVILY_API_KEY="tvly-..."      # From tavily.com dashboard
export BRAVE_API_KEY="BSA..."          # From brave.com/search/api
export LINKUP_API_KEY="xxxxxxxx-..."   # UUID from linkup.so
# SEARXNG_API_KEY not needed (local Docker)
```

### XDG Directories (optional)
- `XDG_CONFIG_HOME` - Config directory (default: `~/.config`)
- `XDG_DATA_HOME` - Data directory (default: `~/.local/share`)
- `XDG_STATE_HOME` - State directory (default: `~/.local/state`)

## License

MIT
