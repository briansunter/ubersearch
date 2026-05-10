#!/usr/bin/env bun
/**
 * UberSearch MCP Server — entry point.
 *
 * Real implementation lives in `src/mcp/`. This file exists to keep the
 * historical entry path (`bun run src/mcp-server.ts`) and the `cli.ts`
 * import (`./mcp-server`) stable.
 */

export { serve } from "./mcp/bootstrap";

import { serve } from "./mcp/bootstrap";

if (import.meta.main) {
  serve();
}
