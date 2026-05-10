---
status: completed
---

# Migrate MCP server to `@modelcontextprotocol/sdk`

Tracking ADR: [`docs/adr/0001-migrate-to-mcp-sdk.md`](../../docs/adr/0001-migrate-to-mcp-sdk.md) (proposed → accepted on completion of this work).

## Problem Statement

`src/mcp-server.ts` hand-rolls JSON-RPC over stdio (~424 lines) to expose ubersearch's three tools (`uber_search`, `uber_search_credits`, `uber_search_health`) to MCP clients. Every protocol-level concern — `initialize` handshake, error codes, `notifications/initialized`, `tools/list`, `tools/call` dispatch — is implemented in-tree. As MCP evolves (capability negotiation, resources, prompts, transport variants), keeping the hand-rolled implementation compatible is a maintenance tax that nobody is paying off and a source of latent bugs whenever a new MCP client deviates from what we've tested against.

The current file also conflates four concerns in one module: tool schemas, argument parsing, business-logic handlers, and JSON-RPC transport. Nothing is unit-testable without simulating stdin/stdout.

## Solution

Replace the hand-rolled JSON-RPC dispatch with `@modelcontextprotocol/sdk`'s `Server` + `StdioServerTransport`. While migrating, separate the four concerns into distinct modules so tool handlers and argument parsers can be unit-tested independently of any transport. The external behavior — same three tools, same input schemas, same response shapes — is preserved exactly so existing MCP client configurations (Claude Desktop, etc.) continue working without changes.

## User Stories

1. As a Claude Desktop user with ubersearch configured, I want my existing MCP config to keep working after this migration, so that I don't have to update anything on my end.
2. As an MCP client author integrating with ubersearch, I want the server to handle protocol-level negotiation correctly, so that I don't need to special-case ubersearch's quirks.
3. As an ubersearch maintainer, I want protocol concerns (transport, lifecycle, error codes, capability negotiation) to track upstream rather than be maintained in-tree, so that new MCP features become available without manual implementation.
4. As an ubersearch contributor, I want tool handlers to be unit-testable without spinning up a stdio transport, so that I can verify search/credits/health behavior in isolation.
5. As an ubersearch contributor, I want argument parsing for tool inputs to be unit-testable in isolation, so that I can exercise edge cases (negative limits, malformed strategy, mixed-type arrays) directly.
6. As an ubersearch contributor, I want a single source of truth listing the tools the server exposes, so that adding a new tool is a one-place change.
7. As an ubersearch maintainer, I want an integration test that spins up the SDK-backed server and exercises real MCP requests against it, so that regressions in the SDK glue are caught in CI.
8. As an ubersearch user invoking `uber_search` via MCP, I want the same query/engines/strategy/limit/categories input shape to keep working, so that no client prompt template needs editing.
9. As an ubersearch user invoking `uber_search_credits`, I want the same credit-status output to keep working, so that any tooling parsing it doesn't break.
10. As an ubersearch user invoking `uber_search_health`, I want the per-provider health-check output to keep working, so that operational dashboards continue to read it.
11. As an ubersearch user, I want the server to shut down cleanly on SIGTERM/SIGINT and run lifecycle providers' `shutdown()`, so that Docker-managed providers (SearXNG) stop gracefully when the MCP host closes the connection.
12. As an MCP client, I want invalid tool names to return a structured error with the appropriate JSON-RPC error code, so that I can present a clear failure to the user.
13. As an MCP client, I want missing/empty `query` on `uber_search` to return a structured `-32602` invalid-params error, so that I can distinguish input errors from runtime errors.
14. As an MCP client, I want oversized queries (>2000 chars) to be rejected with a clear error before any provider call, so that we don't waste API credits on degenerate input.
15. As an ubersearch contributor reading the codebase, I want the SDK-glue layer to be a thin shim that registers a tool registry with the SDK, so that the interesting code (handlers, parsers) is where the logic lives — not in the transport.
16. As an ubersearch contributor adding a fourth MCP tool in the future, I want to add one entry to a tool registry plus one handler function, so that I don't need to edit any JSON-RPC dispatch code.

## Implementation Decisions

### Module split

The current single-file MCP server is split into five modules under a new `src/mcp/` directory. The split preserves all existing behavior; it's a refactor in service of testability and the SDK swap.

- **Tool registry** *(new, deep)* — declarative list of `{name, description, inputSchema, handler}` records. One source of truth for which tools the server exposes. Each entry is self-contained data plus a handler reference; the SDK glue iterates the registry to register tools with the `Server`.
- **Argument parsers** *(extract from existing)* — pure functions for parsing MCP tool arguments: `parseOptionalCommaList`, `parseLimit`, `parseStrategy`. Move to their own module so they're importable and unit-testable in isolation. No behavior change.
- **Tool handlers** *(extract from existing)* — three async functions, one per tool: `handleUberSearch`, `handleCredits`, `handleHealth`. Each takes parsed args plus a container reference and returns the tool result. No JSON-RPC awareness. The existing `withTimeout` wrapper is applied at the handler boundary.
- **Server bootstrap** *(replaces `serve()`)* — instantiates `@modelcontextprotocol/sdk`'s `Server`, attaches a `StdioServerTransport`, registers the tool registry, and wires shutdown handlers. Shallow glue — most of its body should be SDK-level configuration, not logic.
- **Shutdown handler** *(keep)* — `setupShutdownHandlers` (SIGTERM/SIGINT → iterate provider registry → call lifecycle `shutdown()`). Stays functionally identical; may move into the bootstrap module if it doesn't justify its own file.

### External contract preservation

- The three tool names (`uber_search`, `uber_search_credits`, `uber_search_health`), their `inputSchema` definitions, and their response shapes (`content: [{type: "text", text: <stringified JSON>}]`) are preserved byte-for-byte where possible. Any divergence forced by the SDK (e.g. a slightly different error-code mapping for unknown methods) must be documented in this PRD's "Further Notes" section.
- The MCP protocol version reported in the `initialize` handshake is whatever the SDK reports for its current release — we no longer hard-code `"2024-11-05"`. This is an explicit contract change but the SDK is the authoritative source.
- `serverInfo.version` should be sourced from `package.json` rather than the hard-coded `"1.0.0"`.

### Container / DI integration

- The MCP server continues to bootstrap the existing DI container (`bootstrapContainer`) — see ADR-0003. Tool handlers receive the container (or specific services from it) as a parameter rather than reading a module-level global.
- The current `globalContainer` module-level variable used by the shutdown handler should be eliminated; the bootstrap module owns the container reference and passes it both to handlers and to the shutdown closure.

### Error-code mapping

- The current code returns `-32700` for parse errors, `-32601` for unknown methods, `-32602` for invalid params, and `-32603` for internal errors. After migration, the SDK is responsible for the protocol-level codes (parse, unknown method, invalid request). Handler-thrown errors should map to `-32602` for messages starting with `Invalid params:` and `-32603` otherwise — same heuristic as today, but applied inside the handler boundary rather than in the dispatch loop.

### Dependency

- Add `@modelcontextprotocol/sdk` to `dependencies` (not `devDependencies`). This is the first runtime dep beyond `zod`; that's intentional and the migration is the trigger.
- Verify `bun build --compile` still produces a working standalone binary with the SDK included. This is a non-negotiable requirement (see ADR-0002) — if the SDK can't be bundled, the migration must be paused and re-evaluated, not pushed through.

## Testing Decisions

### Test philosophy

A good test for this migration exercises **external behavior** — what an MCP client observes, or what a handler returns for a given input — not implementation details like which SDK methods got called or how many JSON-RPC messages were emitted internally. Tests that assert on the structure of the SDK's internal state will rot the moment the SDK is upgraded; tests that assert on observable outputs survive.

### What to test

- **Argument parsers** *(unit)* — exhaustively cover the edge cases: missing/null/empty values, valid happy paths, malformed types (number where string expected, non-positive limits, unknown strategy values, mixed-type arrays). These functions are pure; tests are cheap and high-value.
- **Tool handlers** *(unit)* — each handler tested with a fake/in-memory container. Assert on the return shape and content. For the search handler, stub the underlying `uberSearch` and verify it receives correctly-parsed arguments. For the health handler, register fake providers (some lifecycle-aware, some not) and assert the right `healthy` / `unhealthy` / `skipped` shape comes back.
- **Tool registry shape** *(contract / snapshot)* — snapshot the registry's `(name, description, inputSchema)` for each tool. This catches accidental schema drift that would break MCP clients without us noticing. Update the snapshot deliberately when intentionally evolving a tool's schema.
- **Integration test against the SDK transport** — spin up the server with `StdioServerTransport` connected to in-process pipes (or whatever the SDK's test utilities provide). Send real `initialize`, `tools/list`, and `tools/call` requests; assert response shapes. This is the canary that catches "the handlers work in isolation but the SDK glue is wrong."

### Prior art

- Test runner is `bun:test` with `--preload ./test/setup.ts` — see `CLAUDE.md` and any existing tests under `test/unit/` and `test/integration/`.
- `test/setup.ts` already mocks console output, restores fetch, sets fake API keys, and disables retries. New tests inherit all of this.
- Mirror the source layout: tests for `src/mcp/parseArgs.ts` go in `test/unit/mcp/parseArgs.test.ts`, and so on. Integration test goes in `test/integration/mcp/`.
- Provider unit tests are good prior art for the handler tests (they construct a provider, hand it a fake container/config, and assert on the return shape).

## Out of Scope

- **Adding new MCP tools.** This migration preserves the existing three tools exactly. Any new tool (e.g. `uber_search_engines` to list configured providers) is a separate ticket.
- **Adding MCP resources or prompts support.** The SDK supports both, but this migration replaces the existing tools surface only. A separate PRD can add resources/prompts on top of the migrated foundation.
- **Changing the underlying `uberSearch` / `getCreditStatus` / health-check behavior.** The handlers wrap existing functions; their internals are untouched.
- **Streaming responses.** Current handlers are request/response only. Whether to use the SDK's streaming primitives is a future decision.
- **Migrating CLI invocation.** Only the MCP server (`src/mcp-server.ts`) is in scope. The CLI (`src/cli.ts`) is unrelated.
- **Bumping the announced MCP protocol version intentionally.** The SDK chooses the version; we accept whatever it reports.

## Further Notes

- The hand-rolled implementation should be removed in the same change that introduces the SDK-backed server — no parallel coexistence. ADR-0001 explicitly says "the hand-rolled implementation should not be extended"; leaving it next to the new code invites accidental edits to the wrong file.
- After the migration lands, update ADR-0001's status frontmatter from `proposed` to `accepted`, and note in the body that the migration is complete.
- The `bin` entry in `package.json` and any documented invocation (`README.md`, `docs/MCP_SERVER.md`) should be checked for references to the old file path. If `src/mcp-server.ts` is renamed/moved, update those references in the same change.
- A pre-existing manual-testing doc lives at `docs/MANUAL_TESTING.md`. After the migration, manually verify the three tools against Claude Desktop end-to-end before merging — the integration test catches a lot, but Claude Desktop is the canonical client and is worth a smoke check.

### Divergences from the hand-rolled implementation (forced by the SDK)

These were discovered during the migration and accepted as the correct trade-off. None affect well-behaved MCP clients exercising the documented happy path.

- **`serverInfo.version`** is now read from `package.json` instead of the hard-coded `"1.0.0"`. This was an explicit goal in the "External contract preservation" section.
- **MCP protocol version** is whatever the SDK announces. The hand-rolled code had `"2024-11-05"` hard-coded; the SDK currently announces the same value but is now authoritative.
- **`initialize` requires complete params**. The SDK enforces the InitializeRequest schema (`protocolVersion`, `capabilities`, `clientInfo`); the hand-rolled implementation accepted bare `initialize` calls. Real clients always send proper params.
- **Method-not-found error message** is the generic `"Method not found"` — the SDK does not echo the unknown method name. Hand-rolled returned `"Method not found: <name>"`.
- **Malformed JSON is silently dropped** by the SDK over stdio. The hand-rolled code returned `-32700 Parse error` responses. Real clients do not send malformed JSON, so the user-facing impact is nil.
- **Tools/call shape errors map to `-32603 Internal error`** with structured zod-validation messages, not `-32602 InvalidParams`. This applies to missing `params`, missing `params.name`, and `null arguments`. Handler-thrown errors prefixed `Invalid params:` still map to `-32602` as before.

### Bun-compile keep-alive

`bun build --compile` produced a binary that exited cleanly as soon as the SDK's `connect(transport)` resolved — the SDK's `_stdin.on('data', ...)` listener alone was not enough to keep the event loop alive in compiled mode. The fix in `serve()` is a `Promise` that resolves on `transport.onclose`, anchoring the process to the transport's lifetime. This change is required for the binary distribution path mandated by ADR-0002.
