---
status: accepted
---

# Auto-manage SearXNG via Docker lifecycle

ubersearch starts and stops a local SearXNG container itself (`src/core/docker/`) rather than asking the user to point at an existing instance. SearXNG is the only no-API-key provider in the registry — auto-managing it preserves a "works out of the box without registering for any API" default. Without this, a fresh install with no API keys configured would return no results.

The lifecycle manager (`DockerLifecycleManager`) is generic: it doesn't know about SearXNG specifically, so other local-only providers can adopt the same pattern. Users without Docker installed fall back to whichever API-key providers they've configured.
