/**
 * Integration tests for SearXNG docker-compose.yml variable interpolation.
 *
 * Reproduces the original symptom end-to-end: `docker compose config` (which
 * parses the file on every subcommand, including stop/down) must not fail with
 * "invalid spec: :/etc/searxng:rw: empty section between colons" when the
 * SEARXNG_* env vars are unset, and must honour explicit overrides from the
 * launcher.
 *
 * These tests need the `docker` CLI (to interpolate the compose file) but NOT a
 * running daemon. Skip with: SKIP_DOCKER_TESTS=true (the default).
 */

import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { getBundledSearxngComposePath } from "../../src/core/paths";

const skipDockerTests = process.env.SKIP_DOCKER_TESTS !== "false";

// `docker compose version` is a plugin check that does not require a daemon.
let dockerCliAvailable = false;
if (!skipDockerTests) {
  try {
    execFileSync("docker", ["compose", "version"], { stdio: "ignore", timeout: 5000 });
    dockerCliAvailable = true;
  } catch {
    dockerCliAvailable = false;
  }
}

const composePath = getBundledSearxngComposePath();
const projectRoot = join(import.meta.dir, "..", "..");

describe.skipIf(skipDockerTests || !dockerCliAvailable)(
  "SearXNG docker-compose.yml interpolation",
  () => {
    test("parses without empty-spec error when env vars are unset", async () => {
      const env = { ...process.env };
      delete env.SEARXNG_CONFIG;
      delete env.SEARXNG_DATA;
      delete env.SEARXNG_SECRET;

      const { stdout } = await runComposeConfig(env);

      // No bind mount should resolve to an empty source.
      expect(stdout).not.toContain("source: ''");
      expect(stdout).not.toContain("empty section between colons");

      // Bind mounts fall back to ubersearch's XDG locations.
      expect(stdout).toMatch(/source: .*\/.config\/ubersearch\/searxng\/config/);
      expect(stdout).toMatch(/source: .*\/.local\/share\/ubersearch\/searxng\/data/);
    });

    test("honours explicit SEARXNG_* overrides (launcher path)", async () => {
      const env = {
        ...process.env,
        SEARXNG_CONFIG: "/tmp/uc-integration-config",
        SEARXNG_DATA: "/tmp/uc-integration-data",
        SEARXNG_SECRET: "integration-secret",
      };

      const { stdout } = await runComposeConfig(env);

      expect(stdout).toContain("source: /tmp/uc-integration-config");
      expect(stdout).toContain("source: /tmp/uc-integration-data");
    });
  },
);

/** Run `docker compose config` against the bundled file with a custom environment. */
async function runComposeConfig(env: NodeJS.ProcessEnv): Promise<{ stdout: string }> {
  if (!composePath) {
    throw new Error(
      "bundled SearXNG docker-compose.yml not found; providers/ must ship with the package",
    );
  }
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  return execFileAsync("docker", ["compose", "-f", composePath, "config"], {
    cwd: projectRoot,
    env,
    timeout: 15000,
  });
}
