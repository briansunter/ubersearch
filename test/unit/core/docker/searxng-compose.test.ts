/**
 * Regression tests for the bundled SearXNG docker-compose.yml.
 *
 * Guards against "invalid spec: :/etc/searxng:rw: empty section between colons",
 * which occurs when a bind-mount source variable interpolates to an empty string
 * (e.g. someone running `docker compose -f ... stop` by hand, without the
 * ubersearch launcher injecting the SEARXNG_CONFIG/SEARXNG_DATA env vars). Docker
 * Compose parses the file on every subcommand, so an empty source blocked even
 * `stop`/`down`. Every bind mount must declare a `${VAR:-default}` fallback.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { getBundledSearxngComposePath } from "../../../../src/core/paths";

describe("bundled SearXNG docker-compose.yml volume mounts", () => {
  const composePath = getBundledSearxngComposePath();
  if (!composePath) {
    throw new Error(
      "bundled SearXNG docker-compose.yml not found; providers/ must ship with the package",
    );
  }
  const compose = readFileSync(composePath, "utf-8");

  const bindMounts = [
    { target: "/etc/searxng", variable: "SEARXNG_CONFIG" },
    { target: "/var/cache/searxng", variable: "SEARXNG_DATA" },
  ];

  for (const { target, variable } of bindMounts) {
    test(`${variable} mount to ${target} never resolves to an empty source`, () => {
      // Match only real YAML list items (volume mounts), skipping comment lines
      // that may also mention the target path (e.g. the regression note above).
      const line = compose.split("\n").find((l) => {
        const trimmed = l.trim();
        return !trimmed.startsWith("#") && trimmed.startsWith("- ") && l.includes(`${target}:`);
      });
      expect(line, `expected a volume mount targeting ${target}`).toBeDefined();

      // A bare `${VARIABLE}:...` (no `:-default`) interpolates to "" when unset,
      // producing the malformed "empty section between colons" spec.
      expect(
        line,
        `volume targeting ${target} must use \${${variable}:-default} so it never resolves to an empty host path`,
      ).toContain(`\${${variable}:-`);
    });
  }
});
