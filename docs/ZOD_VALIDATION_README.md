# Zod Configuration Validation

## Overview

The ai-search tool now uses **Zod** for runtime configuration validation, ensuring:

- Type safety at runtime
- Clear error messages for invalid configuration
- Schema-based validation
- Integration with CLI options

## Quick Start

Zod automatically validates your config when loaded:

```typescript
import { loadConfig } from "./src/config/load";

const config = loadConfig(); // Automatically validated with Zod
```

If configuration is invalid, you'll get clear error messages:

```
Error: Configuration validation failed:
- engines[0].endpoint: Expected string, received number
- engines[1].defaultLimit: Expected positive integer, received -5
- priority.scoreWeight.searxng: Expected number, received "high"
```

## Configuration Structure with Zod

### Root Configuration

```typescript
const configSchema = z.object({
  defaultEngineOrder: z.array(z.string()).min(1),
  priority: priorityConfigSchema.optional(),
  engines: z.array(engineConfigSchema).min(1),
  storage: z
    .object({
      creditStatePath: z.string().optional(),
    })
    .optional(),
});
```

### Engine Configuration

Each engine type has its own schema with required fields:

```typescript
// Tavily
{
  type: 'tavily',
  id: string,
  enabled: boolean,
  displayName: string,
  apiKeyEnv: string,
  endpoint: string,  // Must be valid URL
  searchDepth: 'basic' | 'advanced',
  monthlyQuota: positive integer,
  creditCostPerSearch: positive integer,
  lowCreditThresholdPercent: 0-100
}

// Brave
{
  type: 'brave',
  id: string,
  enabled: boolean,
  displayName: string,
  apiKeyEnv: string,
  endpoint: string,  // Must be valid URL
  defaultLimit: positive integer,
  monthlyQuota: positive integer,
  creditCostPerSearch: positive integer,
  lowCreditThresholdPercent: 0-100
}

// Linkup (with Docker support)
{
  type: 'linkup',
  id: string,
  enabled: boolean,
  displayName: string,
  apiKeyEnv: string,
  endpoint: string,  // Must be valid URL
  monthlyQuota: positive integer,
  creditCostPerSearch: positive integer,
  lowCreditThresholdPercent: 0-100,

  // Optional Docker settings
  autoStart?: boolean,
  autoStop?: boolean,
  composeFile?: string,
  containerName?: string,
  healthEndpoint?: string,
  initTimeoutMs?: positive integer
}

// SearXNG (with Docker support)
{
  type: 'searchxng',
  id: string,
  enabled: boolean,
  displayName: string,
  apiKeyEnv: string,
  endpoint: string,  // Must be valid URL
  defaultLimit: positive integer,
  monthlyQuota: positive integer,
  creditCostPerSearch: positive integer,
  lowCreditThresholdPercent: 0-100,

  // Optional Docker settings
  autoStart?: boolean,
  autoStop?: boolean,
  composeFile?: string,
  containerName?: string,
  healthEndpoint?: string,
  initTimeoutMs?: positive integer
}
```

### Priority Configuration

```typescript
const priorityConfigSchema = z.object({
  // Search order: which engines to try first
  globalPriority: z.array(z.string()).optional(),

  // Result ranking: which engines to show first
  resultPriority: z.record(z.number()).optional(),

  // Score weighting: multiplier for scores from each engine
  scoreWeight: z.record(z.number()).optional(),
});
```

## Example Valid Configuration

```json
{
  "defaultEngineOrder": ["searxng", "tavily", "brave", "linkup"],
  "priority": {
    "globalPriority": ["searxng", "tavily", "brave", "linkup"],
    "resultPriority": {
      "searxng": 1.0,
      "tavily": 0.9,
      "brave": 0.85,
      "linkup": 0.9
    },
    "scoreWeight": {
      "searxng": 1.0,
      "tavily": 1.0,
      "brave": 1.0,
      "linkup": 1.0
    }
  },
  "engines": [
    {
      "id": "searxng",
      "type": "searchxng",
      "enabled": true,
      "displayName": "SearXNG (Local)",
      "apiKeyEnv": "SEARXNG_API_KEY",
      "endpoint": "http://localhost:8888/search",
      "defaultLimit": 10,
      "monthlyQuota": 10000,
      "creditCostPerSearch": 0,
      "lowCreditThresholdPercent": 0,
      "autoStart": true,
      "autoStop": true,
      "composeFile": "./providers/searxng/docker-compose.yml",
      "containerName": "searxng",
      "healthEndpoint": "http://localhost:8888/healthz",
      "initTimeoutMs": 60000
    }
  ]
}
```

## Validation

Configuration is automatically validated when loaded:

```typescript
// src/config/load.ts
function loadConfig(): SearchXngConfig {
  // ... load raw config ...

  // Validate with Zod
  const result = SearchXngConfigSchema.safeParse(rawConfig);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Configuration validation failed:\n${errors}`);
  }

  return result.data;
}
```

**CLI Integration**: CLI options are validated separately
to ensure user-provided values are compatible with config.

## Validation Error Examples

### Missing Required Field

```json
{
  "engines": [
    {
      "id": "searxng",
      "type": "searchxng"
      // Missing apiKeyEnv, endpoint, etc.
    }
  ]
}
```

Error:

```
Configuration validation failed:
- engines[0].apiKeyEnv: Required
- engines[0].endpoint: Required
- engines[0].defaultLimit: Required
```

### Invalid Type

```json
{
  "engines": [
    {
      "id": "searxng",
      "type": "searchxng",
      "endpoint": 12345, // Should be string
      "defaultLimit": "10" // Should be number
    }
  ]
}
```

Error:

```
Configuration validation failed:
- engines[0].endpoint: Expected string, received number
- engines[0].defaultLimit: Expected number, received string
```

### Invalid URL

```json
{
  "engines": [
    {
      "id": "searxng",
      "type": "searchxng",
      "endpoint": "not-a-valid-url"
    }
  ]
}
```

Error:

```
Configuration validation failed:
- engines[0].endpoint: Invalid url
```

### Invalid Enum Value

```json
{
  "engines": [
    {
      "id": "tavily",
      "type": "tavily",
      "searchDepth": "advanced-plus" // Not in enum
    }
  ]
}
```

Error:

```
Configuration validation failed:
- engines[0].searchDepth: Invalid enum value. Expected 'basic' | 'advanced', received 'advanced-plus'
```

## CLI Option Validation

CLI options also use Zod for validation:

```typescript
const CliInputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().optional(),
  engines: z.array(z.string()).min(1).optional(),
  strategy: z.enum(["all", "first-success"]).optional(),
  json: z.boolean().optional(),
  priority: priorityConfigSchema.optional(),
});
```

Example validation:

```bash
$ bun run src/cli.ts "test" --limit -5

Error: Invalid limit: Expected positive integer, received -5

$ bun run src/cli.ts "test" --strategy invalid

Error: Invalid strategy: Expected 'all' | 'first-success', received 'invalid'
```

## Best Practices

### 1. Use TypeScript for Configuration

Define config in code to get type safety:

```typescript
import type { SearchxngConfig } from "./config/validation";

const searxngConfig: SearchxngConfig = {
  id: "searxng",
  type: "searchxng",
  enabled: true,
  displayName: "SearXNG (Local)",
  apiKeyEnv: "SEARXNG_API_KEY",
  endpoint: "http://localhost:8888/search",
  defaultLimit: 10,
  monthlyQuota: 10000,
  creditCostPerSearch: 0,
  lowCreditThresholdPercent: 0,
  autoStart: true,
  autoStop: true,
  composeFile: "./providers/searxng/docker-compose.yml",
  containerName: "searxng",
  healthEndpoint: "http://localhost:8888/healthz",
  initTimeoutMs: 60000,
};
```

### 2. Validate Before Use

```typescript
// Always validate before processing config
const result = SearchxngConfigSchema.safeParse(config);

if (!result.success) {
  console.error("Config is invalid:", result.error.errors);
  process.exit(1);
}

const validConfig = result.data;
```

### 3. Use Default Values

Zod provides `.default()` for optional fields:

```typescript
const schema = z.object({
  autoStart: z.boolean().default(true),
  initTimeoutMs: z.number().int().positive().default(30000),
});
```

### 4. Custom Error Messages

Provide user-friendly errors:

```typescript
const schema = z.object({
  apiKeyEnv: z
    .string()
    .refine(
      (val) => val.startsWith("API_KEY_"),
      "API key environment variable should start with API_KEY_",
    ),
});
```

## Migration from No Validation

If you have existing config files:

1. **Run validation** - It will show any errors
2. **Fix errors** - Add missing fields, fix types
3. **Test** - Ensure everything still works
4. **Commit** - Update config files with validation

Example migration:

```diff
  {
    "id": "searxng",
-    "type": "search"  // Wrong type
+    "type": "searchxng"
  }
```

## Future Enhancements

Possible improvements:

- Config hot-reloading with file watching
- Remote config validation (fetch from URL)
- Config migration helpers
- Interactive config builder
- Config diff tool
- Config template generator

## Summary

Zod provides:

- ✅ Runtime type safety
- ✅ Clear error messages
- ✅ Schema documentation
- ✅ Type inference
- ✅ Integration with TypeScript

This makes configuration:

- Safer (catches errors early)
- More maintainable (self-documenting)
- Easier to debug (clear errors)
- More robust (prevents invalid states)
