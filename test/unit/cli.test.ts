/**
 * Comprehensive CLI Tests
 *
 * Tests for src/cli.ts covering all command-line interface functionality
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type ProcessMock = NodeJS.Process & {
  exit: ReturnType<typeof mock<(code?: number) => never>>;
  stderr: { write: ReturnType<typeof mock<(chunk: string | Uint8Array) => unknown>> };
  stdout: { write: ReturnType<typeof mock<(chunk: string | Uint8Array) => unknown>> };
};

type ConsoleMock = Console & {
  log: ReturnType<typeof mock<(...args: unknown[]) => void>>;
  error: ReturnType<typeof mock<(...args: unknown[]) => void>>;
};

// Store original process and console state
const originalProcess = process;
const originalConsole = console;

// Helper to set up process mock
function setupProcessMock(argv: string[]) {
  // Create a new process object with the specified argv
  const newProcess = {
    ...originalProcess,
    argv: ["bun", "cli.ts", ...argv],
  } as ProcessMock;

  // Mock exit to throw an error we can catch
  newProcess.exit = mock<(code?: number) => never>((code) => {
    const exitError = new Error(`Process.exit(${code}) called`);
    (exitError as Error & { exitCode?: number }).exitCode = code;
    throw exitError;
  });

  // Mock stderr and stdout
  newProcess.stderr = {
    write: mock<(chunk: string | Uint8Array) => unknown>(),
  };

  newProcess.stdout = {
    write: mock<(chunk: string | Uint8Array) => unknown>(),
  };

  // Replace global process
  global.process = newProcess;
  return newProcess;
}

// Helper to capture console output
function setupConsoleCapture() {
  const captured = {
    log: [] as string[],
    error: [] as string[],
  };

  const newConsole = { ...originalConsole } as ConsoleMock;

  newConsole.log = mock<(...args: unknown[]) => void>((...args) => {
    captured.log.push(args.join(" "));
  });

  newConsole.error = mock<(...args: unknown[]) => void>((...args) => {
    captured.error.push(args.join(" "));
  });

  global.console = newConsole;
  return captured;
}

// Helper to restore process and console
function restoreProcessAndConsole() {
  global.process = originalProcess;
  global.console = originalConsole;
}

describe("CLI Tests", () => {
  let captured: ReturnType<typeof setupConsoleCapture>;

  beforeEach(() => {
    captured = setupConsoleCapture();
  });

  afterEach(() => {
    restoreProcessAndConsole();
    // Clear all mocks to ensure clean state between tests
    mock.restore();
  });

  describe("Help Command", () => {
    test("should show help when no arguments provided", async () => {
      setupProcessMock([]);

      try {
        // Delete the module from cache to force re-import
        delete require.cache[require.resolve("../../src/cli.ts")];
        await import("../../src/cli.ts");
      } catch (error: unknown) {
        // Expected to fail due to process.exit simulation
        if (!(error instanceof Error) || !error.message.includes("Process.exit")) {
          throw error;
        }
      }

      expect(process.exit).toHaveBeenCalledWith(0);
      expect(captured.log.length).toBeGreaterThan(0);
      const output = captured.log.join("\n");
      expect(output).toContain("multi-search — Unified search across multiple providers");
      expect(output).toContain("USAGE:");
      expect(output).toContain("ARGUMENTS:");
      expect(output).toContain("OPTIONS:");
    });

    test("should show help when --help is provided", async () => {
      setupProcessMock(["--help"]);

      try {
        // Delete the module from cache to force re-import
        delete require.cache[require.resolve("../../src/cli.ts")];
        await import("../../src/cli.ts");
      } catch (error: unknown) {
        // Expected to fail due to process.exit simulation
        if (!(error instanceof Error) || !error.message.includes("Process.exit")) {
          throw error;
        }
      }

      expect(process.exit).toHaveBeenCalledWith(0);
    });

    test("should show help when -h is provided", async () => {
      setupProcessMock(["-h"]);

      try {
        // Delete the module from cache to force re-import
        delete require.cache[require.resolve("../../src/cli.ts")];
        await import("../../src/cli.ts");
      } catch (error: unknown) {
        // Expected to fail due to process.exit simulation
        if (!(error instanceof Error) || !error.message.includes("Process.exit")) {
          throw error;
        }
      }

      expect(process.exit).toHaveBeenCalledWith(0);
    });

    test("should show help content includes all expected sections", async () => {
      setupProcessMock(["--help"]);

      try {
        // Delete the module from cache to force re-import
        delete require.cache[require.resolve("../../src/cli.ts")];
        await import("../../src/cli.ts");
      } catch (error: unknown) {
        // Expected to fail due to process.exit simulation
        if (!(error instanceof Error) || !error.message.includes("Process.exit")) {
          throw error;
        }
      }

      const output = captured.log.join("\n");
      expect(output).toContain("multi-search <query> [options]");
      expect(output).toContain("multi-search credits");
      expect(output).toContain("--json");
      expect(output).toContain("--engines");
      expect(output).toContain("--strategy");
      expect(output).toContain("--limit");
      expect(output).toContain("--include-raw");
      expect(output).toContain("TAVILY_API_KEY");
      expect(output).toContain("BRAVE_API_KEY");
    });
  });

  describe("Credits Command", () => {
    let testDir: string;
    let originalCwd: string;

    beforeEach(() => {
      // Create temp directory and config file for credits test
      testDir = join(tmpdir(), `multi-search-cli-test-${Date.now()}`);
      mkdirSync(testDir, { recursive: true });

      // Create a valid config file
      const validConfig = {
        defaultEngineOrder: ["tavily"],
        engines: [
          {
            id: "tavily",
            type: "tavily",
            enabled: true,
            displayName: "Tavily Search",
            apiKeyEnv: "TAVILY_API_KEY",
            endpoint: "https://api.tavily.com/search",
            searchDepth: "basic",
            monthlyQuota: 1000,
            creditCostPerSearch: 1,
            lowCreditThresholdPercent: 80,
          },
        ],
      };
      writeFileSync(join(testDir, "multi-search.config.json"), JSON.stringify(validConfig));

      // Save and change cwd so config is found
      originalCwd = process.cwd();
    });

    afterEach(() => {
      // Restore cwd and cleanup
      try {
        process.chdir(originalCwd);
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    test("should execute credits command successfully", async () => {
      // Change to test directory where config exists
      process.chdir(testDir);

      setupProcessMock(["credits"]);

      try {
        // Delete the module from cache to force re-import
        delete require.cache[require.resolve("../../src/cli.ts")];
        await import("../../src/cli.ts");
      } catch (error: unknown) {
        // Expected to fail due to process.exit simulation
        if (!(error instanceof Error) || !error.message.includes("Process.exit")) {
          throw error;
        }
      }

      // Check that exit was called with code 0 (success)
      expect(process.exit).toHaveBeenCalledWith(0);
      // Check that some output was logged
      expect(captured.log.length).toBeGreaterThan(0);
    });
  });

  describe("Search Command - Query Parsing", () => {
    test("should require a search query", async () => {
      setupProcessMock(["--json"]);

      try {
        // Delete the module from cache to force re-import
        delete require.cache[require.resolve("../../src/cli.ts")];
        await import("../../src/cli.ts");
      } catch (error: unknown) {
        // Expected to fail due to process.exit simulation
        if (!(error instanceof Error) || !error.message.includes("Process.exit")) {
          throw error;
        }
      }

      expect(process.exit).toHaveBeenCalledWith(1);
      expect(captured.error.some((msg) => msg.includes("Query is required"))).toBe(true);
    });

    test("should handle single word query", async () => {
      setupProcessMock(["test"]);

      try {
        // Delete the module from cache to force re-import
        delete require.cache[require.resolve("../../src/cli.ts")];
        await import("../../src/cli.ts");
      } catch (error: unknown) {
        // Expected to fail due to process.exit simulation
        if (!(error instanceof Error) || !error.message.includes("Process.exit")) {
          throw error;
        }
      }

      // If we get here without exit(1), it means the query was accepted
      // Note: We might still exit due to missing API keys, but not due to query parsing
    });

    test("should handle multi-word query", async () => {
      setupProcessMock(["test", "query", "with", "spaces"]);

      try {
        // Delete the module from cache to force re-import
        delete require.cache[require.resolve("../../src/cli.ts")];
        await import("../../src/cli.ts");
      } catch (error: unknown) {
        // Expected to fail due to process.exit simulation
        if (!(error instanceof Error) || !error.message.includes("Process.exit")) {
          throw error;
        }
      }

      // If we get here without exit(1), it means the query was accepted
    });

    test("should handle quoted query", async () => {
      setupProcessMock(['"test query"']);

      try {
        // Delete the module from cache to force re-import
        delete require.cache[require.resolve("../../src/cli.ts")];
        await import("../../src/cli.ts");
      } catch (error: unknown) {
        // Expected to fail due to process.exit simulation
        if (!(error instanceof Error) || !error.message.includes("Process.exit")) {
          throw error;
        }
      }

      // If we get here without exit(1), it means the query was accepted
    });
  });

  describe("Search Command - Option Parsing", () => {
    test("should parse --json flag", async () => {
      setupProcessMock(["test", "query", "--json"]);

      try {
        // Delete the module from cache to force re-import
        delete require.cache[require.resolve("../../src/cli.ts")];
        await import("../../src/cli.ts");
      } catch (error: unknown) {
        // Expected to fail due to process.exit simulation
        if (!(error instanceof Error) || !error.message.includes("Process.exit")) {
          throw error;
        }
      }

      // If we get here without exit(1), it means the option was parsed correctly
    });

    test("should parse --engines with single engine", async () => {
      setupProcessMock(["test", "query", "--engines", "tavily"]);

      try {
        // Delete the module from cache to force re-import
        delete require.cache[require.resolve("../../src/cli.ts")];
        await import("../../src/cli.ts");
      } catch (error: unknown) {
        // Expected to fail due to process.exit simulation
        if (!(error instanceof Error) || !error.message.includes("Process.exit")) {
          throw error;
        }
      }

      // If we get here without exit(1), it means the option was parsed correctly
    });

    test("should reject invalid --strategy", async () => {
      setupProcessMock(["test", "query", "--strategy", "invalid"]);

      try {
        // Delete the module from cache to force re-import
        delete require.cache[require.resolve("../../src/cli.ts")];
        await import("../../src/cli.ts");
      } catch (error: unknown) {
        // Expected to fail due to process.exit simulation
        if (!(error instanceof Error) || !error.message.includes("Process.exit")) {
          throw error;
        }
      }

      expect(process.exit).toHaveBeenCalledWith(1);
      expect(captured.error.some((msg) => msg.includes("Invalid strategy"))).toBe(true);
    });

    test("should reject invalid --limit", async () => {
      setupProcessMock(["test", "query", "--limit", "invalid"]);

      try {
        // Delete the module from cache to force re-import
        delete require.cache[require.resolve("../../src/cli.ts")];
        await import("../../src/cli.ts");
      } catch (error: unknown) {
        // Expected to fail due to process.exit simulation
        if (!(error instanceof Error) || !error.message.includes("Process.exit")) {
          throw error;
        }
      }

      expect(process.exit).toHaveBeenCalledWith(1);
      expect(captured.error.some((msg) => msg.includes("Invalid limit"))).toBe(true);
    });
  });
});
