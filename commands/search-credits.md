---
name: search-credits
description: Check search provider credit status and quotas
---

# Search Credits Status

Check the credit status for all configured search providers.

## Usage

### Via MCP Tool
```
uber_search_credits()
```

### Via CLI
```bash
bunx ubersearch credits
```

## Output

Returns credit status for each provider including:
- Current credit balance
- Usage limits
- Low credit warnings

Use this to monitor API usage and plan searches accordingly.
