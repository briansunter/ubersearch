# UberSearch

Unified search CLI + MCP server across Tavily, Brave, Linkup, and SearXNG providers.

## Commands

```bash
bun install                    # Install deps
bun run lint                   # Biome lint check
bun run lint:fix               # Biome auto-fix
bun run test                   # All tests (skips Docker)
bun run typecheck              # TypeScript type check
bun run test:unit              # Unit tests only
bun run test:integration       # Integration tests
bun run test:docker            # Integration with Docker (needs Docker running)
bun run build                  # Bundle to dist/
bun run build:binary           # Compile standalone binary
```

Single-file and pattern test commands:

```bash
bun test test/unit/providers/tavily.test.ts
bun test --test-name-pattern "should handle errors"
bunx tsc --noEmit   # Type check
```

## Testing

- Runtime: `bun:test` (not Jest/Vitest)
- All test commands require `--preload ./test/setup.ts` (already in package.json scripts)
- `test/setup.ts` auto-mocks console output, restores fetch, and sets fake API keys (`test-tavily-key`, etc.)
- `SKIP_DOCKER_TESTS=true` is the default; set to `false` for Docker-dependent tests
- `DEBUG_TESTS=1` or `ENABLE_TEST_LOGS=1` to see console output in tests
- `DISABLE_RETRY=true` is set automatically in test setup to prevent retry-related timeouts
- Test file convention: `test/unit/<path matching src>` and `test/integration/`

## Architecture

- **DI Container**: `src/bootstrap/container.ts` wires everything; `src/core/serviceKeys.ts` has keys
- **Providers**: `src/providers/` — each implements `ISearchProvider` (search method + id)
- **Strategies**: `src/core/strategy/` — `AllProvidersStrategy` (merge all) and `FirstSuccessStrategy` (stop on first success)
- **Plugin system**: `src/plugin/` — `definePlugin`/`PluginRegistry` for custom providers
- **MCP Server**: `src/mcp-server.ts` — stdio server via `@modelcontextprotocol/sdk`; tool registry in `src/mcp/`
- **Config**: Zod-validated, XDG-aware resolution (`./` → `$XDG_CONFIG_HOME/ubersearch/`)
- **Docker lifecycle**: `src/core/docker/` manages SearXNG auto-start/health

## Code Style

- Linter/formatter: Biome (not ESLint/Prettier)
- 2-space indent, 100 char line width
- Strict TypeScript with `noUncheckedIndexedAccess`
- Conventional commits required (semantic-release)
- Run `bun run lint:fix` before committing

## TypeScript Conventions

- Use `interface` for object shapes, `type` for unions/aliases
- Prefer explicit return types on exported functions
- Use `type` keyword for type-only imports (`import type { Foo }`)
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

## Git

- Development branch: `master`
- Pre-commit hook runs `bun run lint`, `bun run test:unit`, and `bun run typecheck`
- Hooks path: `scripts/hooks/` (set via `bun run prepare`)

## Gotchas

- Bun auto-loads `.env` — do not use dotenv
- `StrategyFactory` is a singleton that must be reset between tests (handled by `test/setup.ts`)
- Provider configs use `apiKeyEnv` (env var name, not the key itself)
- SearXNG settings.yml is auto-copied to XDG on first run; the source template is in `providers/searxng/config/`

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
