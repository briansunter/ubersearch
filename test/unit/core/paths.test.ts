import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  expandTilde,
  getBundledSearxngComposePath,
  getDefaultSettingsPath,
} from "../../../src/core/paths";

describe("core/paths", () => {
  test("should resolve the bundled SearXNG compose file", () => {
    const composePath = getBundledSearxngComposePath();

    expect(composePath).toContain("providers/searxng/docker-compose.yml");
    expect(existsSync(composePath)).toBe(true);
  });

  test("should resolve the bundled SearXNG default settings file", () => {
    const settingsPath = getDefaultSettingsPath();

    expect(settingsPath).toContain("providers/searxng/config/settings.yml");
    expect(existsSync(settingsPath)).toBe(true);
  });

  test("should expand leading tilde paths", () => {
    expect(expandTilde("~")).toBe(homedir());
    expect(expandTilde("~/ubersearch/config.json")).toBe(
      join(homedir(), "ubersearch", "config.json"),
    );
    expect(expandTilde("/tmp/ubersearch/config.json")).toBe("/tmp/ubersearch/config.json");
  });
});
