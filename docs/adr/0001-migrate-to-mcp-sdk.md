---
status: accepted
---

# Migrate the MCP server to `@modelcontextprotocol/sdk`

The MCP server (formerly `src/mcp-server.ts`, now `src/mcp/bootstrap.ts`) is implemented on top of the official `@modelcontextprotocol/sdk`. Protocol-level concerns — transport, lifecycle, error codes, capability negotiation — track upstream rather than being maintained in-tree, so the surface stays compatible as MCP evolves.

The previous hand-rolled JSON-RPC implementation existed for historical reasons, not as a deliberate trade-off. The migration was completed by extracting the tool registry, argument parsers, and handlers into `src/mcp/` and replacing the dispatch loop with the SDK's `Server` + `StdioServerTransport`. New MCP features should be built on top of the SDK rather than reverting to hand-rolled protocol code.
