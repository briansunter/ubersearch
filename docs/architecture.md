## Architecture & Ops Overview

- **Config resolution**: `src/config/load.ts` searches explicit path → local `ubersearch.config.(ts|json)` → XDG config. TypeScript configs use `defineConfig` helpers; JSON validated against `config.schema.json`.
- **Validation**: Zod schemas in `src/config/validation.ts`. Errors are formatted with field paths for fast fixes.
- **Dependency injection**: `src/bootstrap/container.ts` wires config, credit state provider, credit manager, provider registry, strategy factory, and orchestrator into the shared container.
- **Providers & plugins**: Built-ins live in `src/plugin/builtin.ts` and register Tavily, Brave, Linkup, and SearXNG. Provider instantiation flows through `ProviderFactory` + `PluginRegistry`.
- **Orchestration**: `UberSearchOrchestrator` executes strategies from `src/core/strategy/*`, collects attempts, and returns normalized results with credit snapshots.
- **Docker lifecycle (SearXNG)**: `src/core/docker/*` manages auto-start/stop and health checks when `autoStart`/`autoStop` are enabled on Docker-capable providers. Health is checked before search; failures degrade gracefully when other providers are available.
- **Credit tracking**: `CreditManager` uses `FileCreditStateProvider` (path from config.storage.creditStatePath or defaults) to track quotas and emit low-credit warnings.

### Runtime flows

1) CLI → `src/cli.ts` → `multiSearch` → `bootstrapContainer` → orchestrator → strategy execution → combined results.  
2) CLI `credits` → `getCreditStatus` → `CreditManager.listSnapshots()`.  
3) CLI `health` → bootstraps providers; lifecycle providers run `init`/`healthcheck`.

### Repository layout (curated)

- `src/app/` – public surface (exports for API consumers)
- `src/bootstrap/` – container setup
- `src/config/` – config types, loaders, validation, helpers
- `src/core/` – orchestrator, strategies, credits, docker helpers
- `src/plugin/` – plugin registry and built-in provider plugins
- `src/providers/` – provider implementations + shared helpers
- `src/tool/` – tool API layer + interfaces used by CLI
- `test/` – mirrors source: unit, integration (Docker optional), helpers

### Ops notes

- Bun-first tooling (`bun test`, `bun run tsc --noEmit`).
- Docker-backed tests can be toggled with `SKIP_DOCKER_TESTS` (default true in scripts).
- Credit state defaults to `~/.local/state/ubersearch/credits.json`; override via config or CLI options that accept `creditStatePath` through bootstrap options.

