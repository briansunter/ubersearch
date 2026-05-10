---
status: completed
---

# Refactor MCP server into 5-module shape (no SDK swap)

## Parent

[`.scratch/mcp-sdk-migration/PRD.md`](../PRD.md)

## What to build

Reshape `src/mcp-server.ts` into five distinct modules under a new `src/mcp/` directory **without** swapping to `@modelcontextprotocol/sdk`. The hand-rolled JSON-RPC dispatch loop stays — it just iterates a declarative tool registry instead of inlined `if (name === "...")` branches. The point of this slice is to land the structural change first so the SDK swap (next slice) is a small, focused PR.

The five modules:

- **Tool registry** — a declarative list of records, one per tool, each carrying `{name, description, inputSchema, handler}`. The dispatch loop looks up tools by name from this registry; adding a tool is a one-line append plus a handler.
- **Argument parsers** — `parseOptionalCommaList`, `parseLimit`, `parseStrategy` extracted as pure exports. No behavior changes.
- **Tool handlers** — three async functions, one per tool (`handleUberSearch`, `handleCredits`, `handleHealth`). Each takes parsed args plus a container reference and returns the tool's result. No JSON-RPC awareness; no module-level globals. Existing `withTimeout` wrapping is applied at the handler boundary.
- **Server bootstrap** — owns the container, instantiates the registry, runs the JSON-RPC dispatch loop. Replaces the current top-level `serve()` body. The `globalContainer` module-level variable is eliminated; the bootstrap closure passes the container both to handlers and to the shutdown hook.
- **Shutdown handler** — preserved as-is functionally (SIGTERM/SIGINT → iterate provider registry → call lifecycle `shutdown()`). May live in the bootstrap module if it doesn't justify its own file.

External behavior must be byte-stable: same three tool names, same input schemas, same response shapes (`content: [{type: "text", text: <stringified JSON>}]`), same error code mapping (`-32700` parse, `-32601` unknown method, `-32602` invalid params, `-32603` internal). Manual smoke test against Claude Desktop after the refactor: the three tools still work without any client config change.

Tests added in this slice:

- **Argument parsers** (unit) — exhaustive edge cases: missing/null/empty values, valid happy paths, malformed types, non-positive limits, unknown strategy values, mixed-type arrays.
- **Tool handlers** (unit) — each handler against an in-memory/fake container. For `handleUberSearch`, stub `uberSearch` and assert it receives correctly-parsed arguments plus assert on the returned `content` shape. For `handleHealth`, register fake providers (some lifecycle-aware, some not) and assert the right `healthy` / `unhealthy` / `skipped` shape.
- **Tool registry shape** (snapshot/contract) — snapshot the `(name, description, inputSchema)` for each registered tool. Catches accidental schema drift.

Tests follow `bun:test` conventions already in use (see `CLAUDE.md`). Mirror source layout: `test/unit/mcp/parseArgs.test.ts`, `test/unit/mcp/handlers/*.test.ts`, `test/unit/mcp/registry.test.ts`.

Respect ADR-0003 (DI container): handlers receive the container as a parameter, not via a module-level singleton.

## Acceptance criteria

- [ ] `src/mcp/` exists and contains the five modules described above
- [ ] `src/mcp-server.ts` is reduced to a thin entry point that delegates into `src/mcp/` (or removed entirely if the bootstrap module's entry path is wired into `package.json`'s `bin` field directly)
- [ ] No module-level `globalContainer` variable exists; the container is passed explicitly to handlers and the shutdown closure
- [ ] All three tools (`uber_search`, `uber_search_credits`, `uber_search_health`) continue to work end-to-end via the existing hand-rolled JSON-RPC dispatch
- [ ] Tool registry is a declarative list; adding a fourth tool would be additive (one registry entry + one handler), with no edits to the dispatch loop
- [ ] Unit tests added for all three argument parsers, covering happy paths and malformed inputs
- [ ] Unit tests added for all three tool handlers, exercising fake/stubbed underlying services
- [ ] Snapshot test added for the tool registry's `(name, description, inputSchema)` shape
- [ ] `bun run test:unit` passes
- [ ] `bun run lint` passes
- [ ] `bun build` and `bun build:binary` continue to produce working output (no SDK introduced yet, so this should be straightforward — but verify)
- [ ] Manual smoke test against Claude Desktop: the three tools work without any client config change
- [ ] No new runtime dependency added (the SDK is introduced in the next slice, not this one)

## Blocked by

None — can start immediately.
