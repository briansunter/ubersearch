# UberSearch

Unified search CLI + MCP server across Tavily, Brave, Linkup, and SearXNG providers.

## Commands

```bash
bun install                    # Install deps
bun run lint                   # Biome lint check
bun run lint:fix               # Biome auto-fix
bun run test                   # All tests (skips Docker)
bun run test:unit              # Unit tests only
bun run test:integration       # Integration tests
bun run test:docker            # Integration with Docker (needs Docker running)
bun run build                  # Bundle to dist/
bun run build:binary           # Compile standalone binary
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
- **MCP Server**: `src/mcp-server.ts` — custom JSON-RPC over stdio (no SDK)
- **Config**: Zod-validated, XDG-aware resolution (`./` → `$XDG_CONFIG_HOME/ubersearch/`)
- **Docker lifecycle**: `src/core/docker/` manages SearXNG auto-start/health

## Code Style

- Linter/formatter: Biome (not ESLint/Prettier)
- 2-space indent, 100 char line width
- Strict TypeScript with `noUncheckedIndexedAccess`
- Conventional commits required (semantic-release)

## Git

- Development branch: `master`
- PR target: `main`
- Pre-commit hook runs `bun run lint` and `bun run test:unit`
- Hooks path: `scripts/hooks/` (set via `bun run prepare`)

## Gotchas

- Bun auto-loads `.env` — do not use dotenv
- `StrategyFactory` is a singleton that must be reset between tests (handled by `test/setup.ts`)
- Provider configs use `apiKeyEnv` (env var name, not the key itself)
- SearXNG settings.yml is auto-copied to XDG on first run; the source template is in `providers/searxng/config/`
