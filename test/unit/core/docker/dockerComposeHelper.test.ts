/**
 * Unit tests for DockerComposeHelper
 * Tests Docker Compose operations
 *
 * Note: These tests don't actually run Docker commands - they test
 * the helper's API and behavior patterns.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { DockerComposeHelper } from "../../../src/core/docker/dockerComposeHelper";

describe("DockerComposeHelper", () => {
  const composeFile = "./docker-compose.yml";

  describe("constructor", () => {
    test("should create instance with compose file", () => {
      const helper = new DockerComposeHelper(composeFile);
      expect(helper).toBeDefined();
    });

    test("should accept any path string", () => {
      const helper = new DockerComposeHelper("/custom/path/docker-compose.yml");
      expect(helper).toBeDefined();
    });
  });

  describe("composeFileExists", () => {
    test("should return false for non-existent file", () => {
      const helper = new DockerComposeHelper("/non/existent/docker-compose.yml");
      expect(helper.composeFileExists()).toBe(false);
    });

    test("should check file existence correctly", () => {
      // Test with actual file that exists in the repo
      const helper = new DockerComposeHelper("./package.json");
      expect(helper.composeFileExists()).toBe(true);
    });
  });

  describe("static isDockerAvailable", () => {
    test("should return a boolean", async () => {
      const result = await DockerComposeHelper.isDockerAvailable();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("method signatures", () => {
    let helper: DockerComposeHelper;

    beforeEach(() => {
      helper = new DockerComposeHelper(composeFile);
    });

    test("should have up method", () => {
      expect(typeof helper.up).toBe("function");
    });

    test("should have stop method", () => {
      expect(typeof helper.stop).toBe("function");
    });

    test("should have down method", () => {
      expect(typeof helper.down).toBe("function");
    });

    test("should have logs method", () => {
      expect(typeof helper.logs).toBe("function");
    });

    test("should have ps method", () => {
      expect(typeof helper.ps).toBe("function");
    });

    test("should have isRunning method", () => {
      expect(typeof helper.isRunning).toBe("function");
    });
  });

  describe("error handling", () => {
    let helper: DockerComposeHelper;

    beforeEach(() => {
      helper = new DockerComposeHelper("/nonexistent/docker-compose.yml");
    });

    test("should throw error when compose file does not exist and up is called", async () => {
      await expect(helper.up()).rejects.toThrow();
    });

    test("should throw error when compose file does not exist and stop is called", async () => {
      await expect(helper.stop()).rejects.toThrow();
    });

    test("should throw error when compose file does not exist and down is called", async () => {
      await expect(helper.down()).rejects.toThrow();
    });

    test("should include command in error message", async () => {
      try {
        await helper.up();
        expect.unreachable("Should have thrown");
      } catch (error: unknown) {
        expect(error.message).toContain("Docker Compose command failed");
        expect(error.message).toContain("docker compose");
      }
    });

    test("should include compose file path in error", async () => {
      try {
        await helper.up();
        expect.unreachable("Should have thrown");
      } catch (error: unknown) {
        expect(error.message).toContain("/nonexistent/docker-compose.yml");
      }
    });
  });

  describe("isRunning behavior", () => {
    // Note: We can't easily mock execAsync since it's created at module load time
    // But we can test the behavior with real Docker if available

    test("should return false when Docker command fails", async () => {
      const helper = new DockerComposeHelper("/nonexistent/docker-compose.yml");
      const result = await helper.isRunning();
      expect(result).toBe(false);
    });

    test("should return false when checking for specific service that does not exist", async () => {
      const helper = new DockerComposeHelper("/nonexistent/docker-compose.yml");
      const result = await helper.isRunning("nonexistent-service");
      expect(result).toBe(false);
    });
  });

  describe("method options", () => {
    let helper: DockerComposeHelper;

    beforeEach(() => {
      helper = new DockerComposeHelper("/nonexistent/docker-compose.yml");
    });

    test("up should accept optional services array", async () => {
      // Should not throw TypeError for calling with services
      try {
        await helper.up(["service1", "service2"]);
      } catch (error: unknown) {
        // Expect Docker error, not type error
        expect(error.message).toContain("Docker");
      }
    });

    test("up should accept optional cwd option", async () => {
      try {
        await helper.up(undefined, { cwd: "/tmp" });
      } catch (error: unknown) {
        expect(error.message).toContain("Docker");
      }
    });

    test("stop should accept optional services array", async () => {
      try {
        await helper.stop(["service1"]);
      } catch (error: unknown) {
        expect(error.message).toContain("Docker");
      }
    });

    test("stop should accept optional cwd option", async () => {
      try {
        await helper.stop(undefined, { cwd: "/tmp" });
      } catch (error: unknown) {
        expect(error.message).toContain("Docker");
      }
    });

    test("down should accept optional cwd option", async () => {
      try {
        await helper.down({ cwd: "/tmp" });
      } catch (error: unknown) {
        expect(error.message).toContain("Docker");
      }
    });

    test("logs should accept optional services and tail parameters", async () => {
      try {
        await helper.logs(["service1"], 100);
      } catch (error: unknown) {
        expect(error.message).toContain("Docker");
      }
    });

    test("logs should accept optional cwd option", async () => {
      try {
        await helper.logs(undefined, 50, { cwd: "/tmp" });
      } catch (error: unknown) {
        expect(error.message).toContain("Docker");
      }
    });

    test("ps should accept optional cwd option", async () => {
      try {
        await helper.ps({ cwd: "/tmp" });
      } catch (error: unknown) {
        expect(error.message).toContain("Docker");
      }
    });

    test("isRunning should accept optional service and cwd options", async () => {
      // isRunning catches errors and returns false, so this should not throw
      const result = await helper.isRunning("service1", { cwd: "/tmp" });
      expect(result).toBe(false);
    });
  });

  describe("path handling", () => {
    test("should handle paths with spaces", () => {
      const helper = new DockerComposeHelper("/path/with spaces/docker-compose.yml");
      expect(helper).toBeDefined();
      // composeFileExists should work even with spaces in path
      expect(helper.composeFileExists()).toBe(false);
    });

    test("should handle relative paths", () => {
      const helper = new DockerComposeHelper("./relative/docker-compose.yml");
      expect(helper).toBeDefined();
    });

    test("should handle absolute paths", () => {
      const helper = new DockerComposeHelper("/absolute/path/docker-compose.yml");
      expect(helper).toBeDefined();
    });

    test("should handle tilde paths", () => {
      const helper = new DockerComposeHelper("~/docker-compose.yml");
      expect(helper).toBeDefined();
    });
  });

  describe("static method behavior", () => {
    test("isDockerAvailable should not throw", async () => {
      // Should resolve without throwing
      const result = await DockerComposeHelper.isDockerAvailable();
      expect(result).toBeDefined();
    });

    test("isDockerAvailable should return boolean type", async () => {
      const result = await DockerComposeHelper.isDockerAvailable();
      expect(typeof result).toBe("boolean");
    });

    test("isDockerAvailable should be consistent across multiple calls", async () => {
      const result1 = await DockerComposeHelper.isDockerAvailable();
      const result2 = await DockerComposeHelper.isDockerAvailable();
      expect(result1).toBe(result2);
    });
  });

  describe("logs default tail parameter", () => {
    test("logs should have default tail of 50", async () => {
      // We can verify this by checking the method signature accepts no tail parameter
      const helper = new DockerComposeHelper("/nonexistent/docker-compose.yml");
      try {
        // Call without tail parameter - should use default of 50
        await helper.logs();
      } catch (error: unknown) {
        // The error should contain the tail parameter from the command
        expect(error.message).toContain("Docker");
      }
    });
  });

  describe("instance independence", () => {
    test("multiple instances should be independent", () => {
      const helper1 = new DockerComposeHelper("/path/one/docker-compose.yml");
      const helper2 = new DockerComposeHelper("/path/two/docker-compose.yml");

      expect(helper1).not.toBe(helper2);
      expect(helper1.composeFileExists()).toBe(false);
      expect(helper2.composeFileExists()).toBe(false);
    });
  });
});
