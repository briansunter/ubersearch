---
status: accepted
---

# Use a dependency-injection container

We wire services through a DI container rather than direct imports. Two reasons drive it: the plugin system (`definePlugin` / `PluginRegistry`) registers providers at runtime, which doesn't fit static imports, and three consumers — CLI, MCP server, and programmatic API — each bootstrap with slightly different bindings. A container makes both tractable from one place (`src/bootstrap/container.ts`).

The current container is hand-rolled (`src/core/container.ts`). That implementation choice was the path of least resistance, not a deliberate decision over tsyringe / inversify. If the in-tree container accumulates more bug-fixes or feature pressure, migrating to a maintained DI library is a worthwhile evaluation.
