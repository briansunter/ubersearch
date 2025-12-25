# Multi-Search MCP Server

This document describes how to use ai-search as an MCP (Model Context Protocol) server.

## Quick Start

### 1. Install Dependencies

```bash
bun install
```

### 2. Configure Search Engines

Copy the sample config to your project root or XDG config directory:

```bash
cp docs/config/ai-search.config.json ai-search.config.json
```

Edit the config to enable/disable engines as needed.

### 3. Set API Keys

Create a `.env` file or set environment variables:

```bash
# For Tavily
export TAVILY_API_KEY=your_key_here

# For Brave Search
export BRAVE_API_KEY=your_key_here

# For Linkup
export LINKUP_API_KEY=your_key_here

# For SearXNG (local)
export SEARXNG_API_KEY=your_key_here
```

### 4. Test the MCP Server

```bash
bun run mcp:test
```

## Running the MCP Server

### Direct Execution

```bash
bun run mcp-server.ts
```

### Available MCP Tools

#### `multi_search`

Search across multiple search providers.

**Parameters:**
- `query` (string, required): Search query
- `engines` (string, optional): Comma-separated list of engines (e.g., "tavily,brave")
- `strategy` (string, optional): "all" or "first-success" (default: "all")
- `limit` (number, optional): Max results per engine (default: 10)

**Example:**
```json
{
  "query": "best TypeScript ORM 2025",
  "engines": "tavily,brave",
  "strategy": "all",
  "limit": 5
}
```

#### `multi_search_credits`

Show credit status for all configured search engines.

**Parameters:** None

#### `multi_search_health`

Run health checks on all configured search providers.

**Parameters:** None

## Integration with Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "ai-search": {
      "command": "bun",
      "args": [
        "run",
        "/path/to/ai-search/mcp-server.ts"
      ],
      "env": {
        "TAVILY_API_KEY": "your_key_here",
        "BRAVE_API_KEY": "your_key_here"
      }
    }
  }
}
```

### Full Claude Desktop Config Example

```json
{
  "mcpServers": {
    "ai-search": {
      "command": "bun",
      "args": [
        "run",
        "/Volumes/Storage/code/ai-search/mcp-server.ts"
      ],
      "env": {
        "TAVILY_API_KEY": "tvly-...",
        "BRAVE_API_KEY": "BSA...",
        "LINKUP_API_KEY": "linkup...",
        "SEARXNG_API_KEY": "your_key"
      }
    }
  }
}
```

Restart Claude Desktop after updating the config.

## Using in Code

```typescript
import { multiSearch, getCreditStatus } from 'ai-search';

// Search
const results = await multiSearch({
  query: "TypeScript best practices",
  limit: 10,
  strategy: "all"
});

console.log(results.items);

// Check credits
const credits = await getCreditStatus();
console.log(credits);
```

## CLI Usage

The CLI is also available and can be linked globally:

```bash
# Run directly
bun run src/cli.ts "search query"

# Link for global access
ln -s $(pwd)/src/cli.ts ~/.local/bin/ai-search
ai-search "search query" --json
```

## Configuration

Config files are searched in this order:

1. `./ai-search.config.ts` or `./ai-search.config.json`
2. `$XDG_CONFIG_HOME/ai-search/config.(ts|json)` (or `~/.config/ai-search/...`)

### TypeScript Config (Recommended)

```typescript
import { defineConfig, defineTavily, defineBrave } from 'ai-search';

export default defineConfig({
  defaultEngineOrder: ['tavily', 'brave'],
  engines: [
    defineTavily({
      id: 'tavily',
      enabled: true,
      displayName: 'Tavily Search',
      apiKeyEnv: 'TAVILY_API_KEY',
      endpoint: 'https://api.tavily.com/search',
      searchDepth: 'basic',
      monthlyQuota: 1000,
      creditCostPerSearch: 1,
      lowCreditThresholdPercent: 80,
    }),
    defineBrave({
      id: 'brave',
      enabled: true,
      displayName: 'Brave Search',
      apiKeyEnv: 'BRAVE_API_KEY',
      endpoint: 'https://api.search.brave.com/res/v1/web/search',
      defaultLimit: 10,
      monthlyQuota: 1000,
      creditCostPerSearch: 1,
      lowCreditThresholdPercent: 80,
    }),
  ],
});
```

## Troubleshooting

### "No config file found"

Create a config file at one of the locations listed in the error message.

### "No providers could be registered"

Check that:
1. At least one engine is enabled in config
2. Required API keys are set as environment variables
3. API keys are valid

### SearXNG 403 Forbidden

The local SearXNG instance is not running. Either:
1. Start SearXNG: `cd providers/searxng && docker-compose up -d`
2. Disable it in config by setting `"enabled": false`

## Development

- **MCP Server**: `mcp-server.ts`
- **Test Script**: `scripts/test-mcp.ts`
- **Core Tool**: `src/tool/multiSearchTool.ts`
- **CLI**: `src/cli.ts`
