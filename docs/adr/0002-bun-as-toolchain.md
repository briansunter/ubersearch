---
status: accepted
---

# Bun as the runtime, package manager, and test framework

We standardize on Bun for everything: runtime, package install, test runner (`bun:test`), bundling, and `--compile` binary output. The two payoffs are a unified toolchain (no separate Jest, ts-node, or dotenv to wire up) and a clean single-binary distribution path so end-users don't need to install Bun themselves — they run the compiled binary.

The trade-off accepted is Bun's smaller ecosystem and the occasional Node-API gap. Tests use `bun:test`, not Jest or Vitest, which means contributors need to use `bun test` rather than the more familiar `npm test`.
