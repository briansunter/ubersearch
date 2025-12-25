# Multi-Search Setup Guide

This guide explains how to set up ubersearch for global use, MCP integration, and testing.

## Overview

Multi-Search provides:
1. **CLI** - Command-line search tool
2. **MCP Server** - For Claude Desktop and other MCP clients
3. **API** - TypeScript library for programmatic use

## Installation

```bash
cd /Volumes/Storage/code/ubersearch
bun install
```

## Configuration

### 1. Create Config File

The sample config is already at `ubersearch.config.json`. It includes:
- SearXNG (local Docker)
- Tavily (cloud)
- Brave Search (cloud)
- Linkup (cloud)

### 2. Set API Keys

Create `.env` file in project root:

```bash
# Required for cloud providers
TAVILY_API_KEY=tvly-your-key-here
BRAVE_API_KEY=BSA-your-key-here
LINKUP_API_KEY=linkup-your-key-here
SEARXNG_API_KEY=your-key-here
```

Get API keys:
- **Tavily**: https://tavily.com (free tier available)
- **Brave**: https://api.search.brave.com (free tier available)
- **Linkup**: https://linkup.so (free tier available)

### 3. Disable SearXNG (Optional)

If you don't want to use local SearXNG, edit `ubersearch.config.json`:

```json
{
  "id": "searxng",
  "enabled": false,
  ...
}
```

## Usage Methods

### Method 1: CLI

Direct execution:
```bash
bun run src/cli.ts "search query" --json
```

Link for global access:
```bash
ln -s $(pwd)/src/cli.ts ~/.local/bin/ubersearch
ubersearch "search query" --json
```

CLI options:
- `--json` - Output as JSON
- `--engines tavily,brave` - Use specific engines
- `--strategy all|first-success` - Search strategy
- `--limit 10` - Max results per engine
- `credits` - Show credit status
- `health` - Run health checks

### Method 2: MCP Server (Claude Desktop)

#### Test MCP Server

```bash
bun run mcp:test
```

#### Add to Claude Desktop Config

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ubersearch": {
      "command": "bun",
      "args": [
        "run",
        "/Volumes/Storage/code/ubersearch/mcp-server.ts"
      ],
      "env": {
        "TAVILY_API_KEY": "your_key",
        "BRAVE_API_KEY": "your_key",
        "LINKUP_API_KEY": "your_key"
      }
    }
  }
}
```

Restart Claude Desktop. You'll see `multi_search`, `multi_search_credits`, and `multi_search_health` tools available.

### Method 3: Programmatic API

```typescript
import { multiSearch, getCreditStatus } from 'ubersearch';

const results = await multiSearch({
  query: "TypeScript best practices",
  limit: 10,
  strategy: "all",
  engines: ["tavily", "brave"]
});

console.log(results.items);
```

## Quick Start Commands

```bash
# Test MCP server
bun run mcp:test

# Test CLI with specific engine
SKIP_DOCKER_TESTS=true bun run src/cli.ts "test query" --engines tavily --json

# Check credits
bun run src/cli.ts credits

# Health check
bun run src/cli.ts health

# Run all tests
bun test

# Lint
bun run lint
```

## Troubleshooting

### No API Keys Error

Make sure `.env` file exists and contains valid keys, or keys are set in environment:

```bash
export TAVILY_API_KEY="tvly-..."
export BRAVE_API_KEY="BSA-..."
export LINKUP_API_KEY="linkup-..."
```

### SearXNG 403 Forbidden

Disable SearXNG in `ubersearch.config.json`:
```json
{"id": "searxng", "enabled": false}
```

### MCP Server Not Connecting

1. Check Claude Desktop config path is correct
2. Ensure `bun` is in PATH
3. Check logs in Claude Desktop for errors
4. Verify API keys are set in Claude Desktop config env

### No Providers Registered

Check:
1. At least one engine is `enabled: true`
2. API key environment variable names match config
3. API keys are valid

## File Structure

```
ubersearch/
├── mcp-server.ts          # MCP server entry point
├── scripts/test-mcp.ts     # MCP test script
├── src/
│   ├── cli.ts             # CLI entry point
│   ├── tool/
│   │   └── multiSearchTool.ts  # Core search function
│   └── app/index.ts       # Public API exports
├── docs/
│   ├── MCP_SERVER.md      # MCP documentation
│   └── config/
│       └── ubersearch.config.json  # Sample config
└── ubersearch.config.json  # Active config
```

## Next Steps

1. Get API keys for at least one provider (Tavily recommended)
2. Set up `.env` file or environment variables
3. Test with `bun run mcp:test`
4. Add to Claude Desktop config for AI-assisted searching
