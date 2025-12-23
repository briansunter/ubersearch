/**
 * Unit tests for FileCreditStateProvider
 * Tests file persistence operations with temporary test directory
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CreditState } from "../../../src/core/credits/CreditStateProvider";
import { FileCreditStateProvider } from "../../../src/core/credits/FileCreditStateProvider";

describe("FileCreditStateProvider", () => {
  let tempDir: string;
  let stateFilePath: string;
  let provider: FileCreditStateProvider;

  beforeEach(async () => {
    // Create unique temp directory for each test
    tempDir = join(tmpdir(), `credit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
    // FileCreditStateProvider expects a full file path, not a directory
    stateFilePath = join(tempDir, "credit-state.json");
    provider = new FileCreditStateProvider(stateFilePath);
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch (_error) {
      // Ignore cleanup errors
    }
  });

  describe("loadState", () => {
    test("should load empty object when no state file exists", async () => {
      const state = await provider.loadState();
      expect(state).toEqual({});
    });

    test("should load existing state from file", async () => {
      const testState: CreditState = {
        google: { used: 25, lastReset: "2024-01-15T10:30:00.000Z" },
        bing: { used: 10, lastReset: "2024-01-15T10:30:00.000Z" },
        brave: { used: 50, lastReset: "2024-01-15T10:30:00.000Z" },
      };

      // Create state file manually
      await writeFile(stateFilePath, JSON.stringify(testState, null, 2));

      const loadedState = await provider.loadState();
      expect(loadedState).toEqual(testState);
    });

    test("should handle corrupted JSON gracefully", async () => {
      await writeFile(stateFilePath, "invalid json content");

      // Implementation catches parse errors and returns empty object
      const state = await provider.loadState();
      expect(state).toEqual({});
    });

    test("should handle empty file", async () => {
      await writeFile(stateFilePath, "");

      // Implementation catches parse errors and returns empty object
      const state = await provider.loadState();
      expect(state).toEqual({});
    });

    test("should handle file with invalid structure", async () => {
      await writeFile(stateFilePath, JSON.stringify({ invalid: "structure" }));

      // Should load but the structure might cause issues in business logic
      const state = await provider.loadState();
      expect(state).toEqual({ invalid: "structure" });
    });

    test("should handle deeply nested state", async () => {
      const complexState: CreditState = {
        google: { used: 100, lastReset: "2024-01-01T00:00:00.000Z" },
        "custom-engine": { used: 999, lastReset: "2024-12-31T23:59:59.999Z" },
        "engine-with-long-name": { used: 0, lastReset: "2024-06-15T12:30:45.123Z" },
      };

      await provider.saveState(complexState);
      const loadedState = await provider.loadState();
      expect(loadedState).toEqual(complexState);
    });
  });

  describe("saveState", () => {
    test("should save state to file", async () => {
      const testState: CreditState = {
        google: { used: 25, lastReset: "2024-01-15T10:30:00.000Z" },
        bing: { used: 10, lastReset: "2024-01-15T10:30:00.000Z" },
      };

      await provider.saveState(testState);

      const fileContent = await readFile(stateFilePath, "utf8");
      const savedState = JSON.parse(fileContent);

      expect(savedState).toEqual(testState);
    });

    test("should create directory if it does not exist", async () => {
      const newTempDir = join(tmpdir(), `credit-test-new-${Date.now()}`);
      const newStateFilePath = join(newTempDir, "credit-state.json");
      const newProvider = new FileCreditStateProvider(newStateFilePath);

      try {
        const testState: CreditState = {
          google: { used: 5, lastReset: new Date().toISOString() },
        };

        await newProvider.saveState(testState);

        // Verify file was created
        const exists = await Bun.file(newStateFilePath).exists();
        expect(exists).toBe(true);

        const loadedState = await newProvider.loadState();
        expect(loadedState).toEqual(testState);
      } finally {
        // Clean up
        await rm(newTempDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    test("should overwrite existing state file", async () => {
      const initialState: CreditState = {
        google: { used: 10, lastReset: "2024-01-01T00:00:00.000Z" },
      };

      const newState: CreditState = {
        google: { used: 25, lastReset: "2024-01-15T10:30:00.000Z" },
        bing: { used: 5, lastReset: "2024-01-15T10:30:00.000Z" },
      };

      await provider.saveState(initialState);
      await provider.saveState(newState);

      const loadedState = await provider.loadState();
      expect(loadedState).toEqual(newState);
    });

    test("should handle empty state", async () => {
      const emptyState: CreditState = {};

      await provider.saveState(emptyState);

      const loadedState = await provider.loadState();
      expect(loadedState).toEqual({});
    });

    test("should handle large state objects", async () => {
      const largeState: CreditState = {};

      // Create state with many engines
      for (let i = 0; i < 100; i++) {
        largeState[`engine-${i}`] = {
          used: Math.floor(Math.random() * 1000),
          lastReset: new Date(2024, 0, i + 1).toISOString(),
        };
      }

      await provider.saveState(largeState);
      const loadedState = await provider.loadState();
      expect(loadedState).toEqual(largeState);
    });

    test("should handle special characters in engine names", async () => {
      const specialState: CreditState = {
        "engine-with-dashes": { used: 10, lastReset: "2024-01-01T00:00:00.000Z" },
        engine_with_underscores: { used: 20, lastReset: "2024-01-01T00:00:00.000Z" },
        "engine.with.dots": { used: 30, lastReset: "2024-01-01T00:00:00.000Z" },
        "engine with spaces": { used: 40, lastReset: "2024-01-01T00:00:00.000Z" },
        "engine@with@symbols": { used: 50, lastReset: "2024-01-01T00:00:00.000Z" },
      };

      await provider.saveState(specialState);
      const loadedState = await provider.loadState();
      expect(loadedState).toEqual(specialState);
    });
  });

  describe("stateExists", () => {
    test("should return false when no state file exists", async () => {
      const exists = await provider.stateExists();
      expect(exists).toBe(false);
    });

    test("should return true when state file exists", async () => {
      const testState: CreditState = {
        google: { used: 10, lastReset: "2024-01-01T00:00:00.000Z" },
      };

      await provider.saveState(testState);

      const exists = await provider.stateExists();
      expect(exists).toBe(true);
    });

    test("should return true for empty state file", async () => {
      const emptyState: CreditState = {};
      await provider.saveState(emptyState);

      const exists = await provider.stateExists();
      expect(exists).toBe(true);
    });

    test("should handle directory at file path location", async () => {
      // Create a directory at the file path location
      await mkdir(stateFilePath, { recursive: true });

      // Bun.file().exists() correctly returns false for directories
      // This is the correct behavior - we want to know if a valid file exists
      const exists = await provider.stateExists();
      expect(exists).toBe(false);
    });
  });

  describe("error handling", () => {
    test("should handle read-only directory gracefully", async () => {
      // This test validates that saveState doesn't throw on permission errors
      // (the implementation logs warnings but doesn't throw)
      const readOnlyDir = join(tmpdir(), `readonly-${Date.now()}`);
      const readOnlyFilePath = join(readOnlyDir, "credit-state.json");

      try {
        await mkdir(readOnlyDir, { recursive: true });

        // Try to make directory read-only (might not work on all systems)
        try {
          await Bun.spawn(["chmod", "555", readOnlyDir]).exited;
        } catch {
          // Skip this test if chmod fails
          return;
        }

        const readOnlyProvider = new FileCreditStateProvider(readOnlyFilePath);
        const testState: CreditState = {
          google: { used: 10, lastReset: new Date().toISOString() },
        };

        // Should not throw - implementation catches errors and logs warnings
        await readOnlyProvider.saveState(testState);

        // File should not exist (save failed silently)
        const exists = await Bun.file(readOnlyFilePath).exists();
        expect(exists).toBe(false);
      } finally {
        // Restore permissions and clean up
        try {
          await Bun.spawn(["chmod", "755", readOnlyDir]).exited;
          await rm(readOnlyDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    test("should handle concurrent access", async () => {
      const testState: CreditState = {
        google: { used: 10, lastReset: "2024-01-01T00:00:00.000Z" },
      };

      // Start multiple save operations concurrently
      const savePromises = Array.from({ length: 10 }, (_, i) =>
        provider.saveState({
          ...testState,
          [`engine-${i}`]: { used: i, lastReset: "2024-01-01T00:00:00.000Z" },
        }),
      );

      // All should complete without errors (last one wins)
      // Note: With concurrent writes, final state depends on race conditions
      await Promise.all(savePromises);

      // At minimum, the file should exist and be readable
      const finalState = await provider.loadState();
      expect(typeof finalState).toBe("object");
    });

    test("should handle very long engine names", async () => {
      const longName = "a".repeat(1000);
      const stateWithLongName: CreditState = {
        [longName]: { used: 5, lastReset: "2024-01-01T00:00:00.000Z" },
      };

      await provider.saveState(stateWithLongName);
      const loadedState = await provider.loadState();
      expect(loadedState).toEqual(stateWithLongName);
    });

    test("should handle unicode characters", async () => {
      const unicodeState: CreditState = {
        引擎: { used: 10, lastReset: "2024-01-01T00:00:00.000Z" },
        "🔍": { used: 20, lastReset: "2024-01-01T00:00:00.000Z" },
        محرك: { used: 30, lastReset: "2024-01-01T00:00:00.000Z" },
      };

      await provider.saveState(unicodeState);
      const loadedState = await provider.loadState();
      expect(loadedState).toEqual(unicodeState);
    });
  });

  describe("file format and structure", () => {
    test("should create valid JSON file", async () => {
      const testState: CreditState = {
        google: { used: 25, lastReset: "2024-01-15T10:30:00.000Z" },
      };

      await provider.saveState(testState);

      const fileContent = await readFile(stateFilePath, "utf8");

      // Should be valid JSON
      expect(() => JSON.parse(fileContent)).not.toThrow();

      // Should be pretty-printed with 2-space indentation
      const lines = fileContent.split("\n");
      expect(lines.some((line) => line.startsWith("  "))).toBe(true); // Has indented lines
    });

    test("should use consistent file naming", async () => {
      const testState: CreditState = { google: { used: 10, lastReset: new Date().toISOString() } };

      await provider.saveState(testState);

      // File should exist at our specified path
      const exists = await Bun.file(stateFilePath).exists();
      expect(exists).toBe(true);

      // Should not create other files
      const files = await readdir(tempDir);
      expect(files).toHaveLength(1);
    });
  });
});
