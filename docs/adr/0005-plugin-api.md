---
status: accepted
---

# Plugin API as the supported extension point

ubersearch exposes a plugin API (`definePlugin`, `PluginRegistry`, `PluginDefinition` in `src/plugin/`) so users can add search providers without forking or waiting for upstream review. Iteration speed is the driver: anyone can ship a custom provider against a stable contract, and the core stays small.

The trade-off accepted is API-surface lock-in. `PluginDefinition`, the config-schema contract, and the `SearchProvider` interface are part of ubersearch's public surface — changes there break third-party plugins, so they're treated as semver-breaking.
