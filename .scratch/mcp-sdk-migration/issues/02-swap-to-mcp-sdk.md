---
status: completed
---

# Swap MCP dispatch to `@modelcontextprotocol/sdk`, remove hand-rolled JSON-RPC

## Parent

[`.scratch/mcp-sdk-migration/PRD.md`](../PRD.md)

## What to build

Replace the in-tree JSON-RPC dispatch loop with `@modelcontextprotocol/sdk`'s `Server` + `StdioServerTransport`. The tool registry, argument parsers, and tool handlers landed in slice 01 are the inputs to this swap — they don't change shape, they just get registered with the SDK instead of iterated by hand. After this slice, no JSON-RPC parsing, error-code constants, or `readline` plumbing live in our codebase: the SDK owns all of that.

Concretely:

- Add `@modelcontextprotocol/sdk` to `dependencies` (not `devDependencies`). This is the first runtime dep beyond `zod`; that's intentional per ADR-0001.
- The bootstrap module from slice 01 instantiates the SDK's `Server`, attaches a `StdioServerTransport`, and registers the tool registry with the SDK's tool-registration API. The dispatch loop, the `MCPRequest` / `MCPResponse` types, the `parseLine` / `writeResponse` helpers, and the manual `initialize` / `notifications/initialized` / `tools/list` / `tools/call` branches all go away.
- The MCP protocol version reported in the `initialize` handshake is whatever the SDK reports for its current release. The previously hard-coded `"2024-11-05"` is removed. `serverInfo.version` is sourced from `package.json` rather than the hard-coded `"1.0.0"`.
- Handler-thrown errors map to JSON-RPC error codes inside the handler boundary (or whatever boundary the SDK exposes): messages starting with `Invalid params:` map to `-32602`, others to `-32603`. The SDK is responsible for the protocol-level codes (parse, unknown method, unknown tool).
- Shutdown handlers (SIGTERM/SIGINT) continue to iterate the provider registry and call lifecycle `shutdown()`. If the SDK exposes its own lifecycle hook, prefer it; otherwise keep the existing process-signal approach.

**Hard gate — do not push through if this fails:** verify `bun build --compile` still produces a working standalone binary with the SDK bundled. ADR-0002 makes single-binary distribution non-negotiable; if the SDK can't be bundled by `bun build --compile`, halt this work, document the failure mode in this issue's comments, and escalate before proceeding. Do not work around it by shipping a non-compiled binary.

The hand-rolled implementation must be removed in the same change — no parallel coexistence (ADR-0001 explicitly says so). Leaving the old file alongside the new code invites accidental edits to the wrong implementation.

Tests added in this slice:

- **Integration test against the SDK transport** — spin up the bootstrap module with `StdioServerTransport` connected to in-process pipes (or whatever the SDK's test utilities provide). Send real `initialize`, `tools/list`, and `tools/call` requests; assert response shapes match what slice 01's handlers return wrapped in the SDK's `content: [{type: "text", text: ...}]` envelope. This test is the canary that catches "handlers work in isolation but the SDK glue is wrong." Goes in `test/integration/mcp/`.
- The existing parser/handler/registry unit tests from slice 01 should pass unchanged.

Documentation updates in this slice:

- `docs/MCP_SERVER.md` — update any references to the hand-rolled internals; the user-facing interface (config, invocation) shouldn't change.
- `README.md` — check for outdated references to `src/mcp-server.ts` if any.
- `package.json` — update the `bin` entry if the entry path moved.
- `docs/adr/0001-migrate-to-mcp-sdk.md` — flip frontmatter `status` from `proposed` to `accepted`; add a sentence noting the migration is complete.

Manual verification before merging: smoke-test the three tools against Claude Desktop end-to-end. Per `docs/MANUAL_TESTING.md`, Claude Desktop is the canonical client and is worth a final check beyond the integration test.

## Acceptance criteria

- [ ] `@modelcontextprotocol/sdk` is in `dependencies` in `package.json`
- [ ] The bootstrap module uses the SDK's `Server` + `StdioServerTransport`; no hand-rolled JSON-RPC parsing, dispatch, or error-code constants remain
- [ ] The `MCPRequest` / `MCPResponse` / `MCPTool` interfaces from the old implementation are deleted
- [ ] All three tools (`uber_search`, `uber_search_credits`, `uber_search_health`) still respond correctly via MCP, with the same input schemas and the same `content: [{type: "text", text: <stringified JSON>}]` response shape as before
- [ ] `serverInfo.version` is read from `package.json` (no hard-coded `"1.0.0"`)
- [ ] Hard-coded MCP protocol version `"2024-11-05"` is removed; whatever the SDK announces is used
- [ ] Handler-thrown error → JSON-RPC error-code mapping is preserved (`Invalid params:` → `-32602`, else `-32603`)
- [ ] SIGTERM/SIGINT shutdown still iterates the provider registry and runs lifecycle `shutdown()` for each
- [ ] **Hard gate:** `bun run build:binary` produces a working standalone binary with the SDK bundled. If this fails, halt and escalate; do not merge.
- [ ] Integration test added under `test/integration/mcp/` exercising `initialize`, `tools/list`, and `tools/call` over the SDK's transport
- [ ] All existing parser / handler / registry unit tests from slice 01 still pass
- [ ] `bun run test` (full suite) passes
- [ ] `bun run lint` passes
- [ ] `docs/MCP_SERVER.md`, `README.md`, and `package.json`'s `bin` are updated for any path or structural changes
- [ ] `docs/adr/0001-migrate-to-mcp-sdk.md` frontmatter `status` flipped from `proposed` to `accepted` with a completion note
- [ ] Manual smoke test against Claude Desktop confirms the three tools work without any client config change

## Blocked by

- [`.scratch/mcp-sdk-migration/issues/01-refactor-mcp-server-modules.md`](./01-refactor-mcp-server-modules.md) — the registry, parsers, and handlers must exist before they can be registered with the SDK.
