# AGENTS.md - Coding Agent Guidelines

## Commands
- **Test all**: `bun test`
- **Test single file**: `bun test test/unit/providers/tavily.test.ts`
- **Test pattern**: `bun test --test-name-pattern "should handle errors"`
- **Lint**: `bun run lint` | **Fix**: `bun run lint:fix`
- **Type check**: `bunx tsc --noEmit`

## Code Style (Biome enforced)
- **Indent**: 2 spaces, **Line width**: 100 chars
- **Imports**: Use `type` keyword for type-only imports (`import type { Foo }`)
- **Formatting**: Run `bun run lint:fix` before committing

## TypeScript Conventions
- **Strict mode** enabled with `noUncheckedIndexedAccess`
- Use `interface` for object shapes, `type` for unions/aliases
- Prefer explicit return types on exported functions
- Error class pattern: extend `Error`, set `this.name` in constructor

## Naming
- **Files**: camelCase (`providerFactory.ts`), PascalCase for classes (`BaseProvider.ts`)
- **Interfaces**: PascalCase, prefix with `I` only for contracts (`ISearchStrategy`)
- **Types**: PascalCase (`SearchQuery`, `EngineId`)

## Error Handling
- Use `SearchError` class with `engineId`, `reason`, and optional `statusCode`
- Validate with Zod schemas (see `src/config/validation.ts`)

## Timeout & Hang Prevention
- **Docker lifecycle**: All Docker operations have timeouts (10s for availability, 30s for init)
- **HTTP requests**: Use `fetchWithErrorHandling()` with 30s timeout abort
- **Health checks**: 3s timeout, fail fast if container not ready
- **Docker compose commands**: 30s default timeout (reduced from 60s)
- Always wrap async operations with timeouts to prevent indefinite hangs

## Testing
- Tests in `test/` mirror `src/` structure
- Use `describe`/`it`/`expect` from Bun test runner
- Call `StrategyFactory.reset()` in `beforeEach` when testing strategies
