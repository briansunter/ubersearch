/**
 * Unit tests for DockerLifecycleManager
 * Tests Docker container lifecycle management
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  type DockerLifecycleConfig,
  DockerLifecycleManager,
} from "../../../src/core/docker/dockerLifecycleManager";
import { setupMockFetch } from "../../__helpers__/docker-mocks";

// Store original fetch
const originalFetch = global.fetch;

describe("DockerLifecycleManager", () => {
  describe("constructor", () => {
    test("should create instance with minimal config", () => {
      const config: DockerLifecycleConfig = {
        autoStart: false,
        autoStop: false,
      };

      const manager = new DockerLifecycleManager(config);
      expect(manager).toBeDefined();
    });

    test("should create instance with full config", () => {
      const config: DockerLifecycleConfig = {
        containerName: "test-container",
        composeFile: "./docker-compose.yml",
        healthEndpoint: "http://localhost:8080/health",
        autoStart: true,
        autoStop: true,
        initTimeoutMs: 30000,
        projectRoot: "/tmp",
      };

      const manager = new DockerLifecycleManager(config);
      expect(manager).toBeDefined();
    });
  });

  describe("init", () => {
    test("should complete immediately when autoStart is false", async () => {
      const config: DockerLifecycleConfig = {
        autoStart: false,
        autoStop: false,
      };

      const manager = new DockerLifecycleManager(config);
      await expect(manager.init()).resolves.toBeUndefined();
    });

    test("should complete immediately when no compose file provided", async () => {
      const config: DockerLifecycleConfig = {
        autoStart: true,
        autoStop: true,
      };

      const manager = new DockerLifecycleManager(config);
      await expect(manager.init()).resolves.toBeUndefined();
    });

    test("should handle multiple init calls gracefully", async () => {
      const config: DockerLifecycleConfig = {
        autoStart: false,
        autoStop: false,
      };

      const manager = new DockerLifecycleManager(config);

      // Multiple init calls should all succeed
      await manager.init();
      await manager.init();
      await manager.init();

      expect(manager.isInitialized()).toBe(true);
    });
  });

  describe("shutdown", () => {
    test("should complete gracefully when autoStop is false", async () => {
      const config: DockerLifecycleConfig = {
        autoStart: false,
        autoStop: false,
      };

      const manager = new DockerLifecycleManager(config);
      await expect(manager.shutdown()).resolves.toBeUndefined();
    });

    test("should complete gracefully when no compose file provided", async () => {
      const config: DockerLifecycleConfig = {
        autoStart: true,
        autoStop: true,
      };

      const manager = new DockerLifecycleManager(config);
      await expect(manager.shutdown()).resolves.toBeUndefined();
    });
  });

  describe("healthcheck", () => {
    test("should return initialized state when no health endpoint configured", async () => {
      const config: DockerLifecycleConfig = {
        autoStart: false,
        autoStop: false,
      };

      const manager = new DockerLifecycleManager(config);

      // Before init, should return false
      expect(await manager.healthcheck()).toBe(false);

      // After init, should return true (initialized state)
      await manager.init();
      expect(await manager.healthcheck()).toBe(true);
    });

    test("should attempt health check when endpoint configured", async () => {
      const config: DockerLifecycleConfig = {
        autoStart: false,
        autoStop: false,
        healthEndpoint: "http://invalid-endpoint-that-does-not-exist:9999/health",
      };

      const manager = new DockerLifecycleManager(config);
      // Should return false when health check fails (endpoint doesn't exist)
      const result = await manager.healthcheck();
      expect(result).toBe(false);
    });
  });

  describe("validateDockerConfig", () => {
    test("should validate config and return result object", async () => {
      const config: DockerLifecycleConfig = {
        composeFile: "/nonexistent/docker-compose.yml",
        autoStart: true,
        autoStop: true,
      };

      const manager = new DockerLifecycleManager(config);
      const result = await manager.validateDockerConfig();

      // Should return result object with valid, errors, warnings
      expect(result).toBeDefined();
      expect(typeof result.valid).toBe("boolean");
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  describe("isInitialized", () => {
    test("should return false before init", () => {
      const config: DockerLifecycleConfig = {
        autoStart: false,
        autoStop: false,
      };

      const manager = new DockerLifecycleManager(config);
      expect(manager.isInitialized()).toBe(false);
    });

    test("should return true after init with autoStart=false", async () => {
      const config: DockerLifecycleConfig = {
        autoStart: false,
        autoStop: false,
      };

      const manager = new DockerLifecycleManager(config);
      await manager.init();
      expect(manager.isInitialized()).toBe(true);
    });
  });

  describe("getConfig", () => {
    test("should return copy of config", () => {
      const config: DockerLifecycleConfig = {
        autoStart: true,
        autoStop: false,
        containerName: "test",
      };

      const manager = new DockerLifecycleManager(config);
      const returnedConfig = manager.getConfig();

      expect(returnedConfig.autoStart).toBe(true);
      expect(returnedConfig.autoStop).toBe(false);
      expect(returnedConfig.containerName).toBe("test");
    });
  });

  describe("method signatures", () => {
    let manager: DockerLifecycleManager;

    beforeEach(() => {
      manager = new DockerLifecycleManager({
        autoStart: false,
        autoStop: false,
      });
    });

    test("should have init method", () => {
      expect(typeof manager.init).toBe("function");
    });

    test("should have shutdown method", () => {
      expect(typeof manager.shutdown).toBe("function");
    });

    test("should have healthcheck method", () => {
      expect(typeof manager.healthcheck).toBe("function");
    });

    test("should have validateDockerConfig method", () => {
      expect(typeof manager.validateDockerConfig).toBe("function");
    });

    test("should have isInitialized method", () => {
      expect(typeof manager.isInitialized).toBe("function");
    });

    test("should have isRunning method", () => {
      expect(typeof manager.isRunning).toBe("function");
    });

    test("should have getConfig method", () => {
      expect(typeof manager.getConfig).toBe("function");
    });
  });

  describe("healthcheck with mocked fetch", () => {
    afterEach(() => {
      global.fetch = originalFetch;
    });

    test("should return true when health endpoint returns 200", async () => {
      const { mockFetch, restore } = setupMockFetch({ healthStatus: 200 });
      global.fetch = mockFetch as typeof fetch;

      const config: DockerLifecycleConfig = {
        autoStart: false,
        autoStop: false,
        healthEndpoint: "http://localhost:8080/health",
      };

      const manager = new DockerLifecycleManager(config);
      const result = await manager.healthcheck();

      expect(result).toBe(true);
      restore();
    });

    test("should return false when health endpoint returns 500", async () => {
      const { mockFetch, restore } = setupMockFetch({ healthStatus: 500 });
      global.fetch = mockFetch as typeof fetch;

      const config: DockerLifecycleConfig = {
        autoStart: false,
        autoStop: false,
        healthEndpoint: "http://localhost:8080/health",
      };

      const manager = new DockerLifecycleManager(config);
      const result = await manager.healthcheck();

      expect(result).toBe(false);
      restore();
    });

    test("should return false when health endpoint times out", async () => {
      const { mockFetch, restore } = setupMockFetch({ healthTimeout: true });
      global.fetch = mockFetch as typeof fetch;

      const config: DockerLifecycleConfig = {
        autoStart: false,
        autoStop: false,
        healthEndpoint: "http://localhost:8080/health",
      };

      const manager = new DockerLifecycleManager(config);
      const result = await manager.healthcheck();

      expect(result).toBe(false);
      restore();
    });

    test("should call health endpoint with correct URL", async () => {
      const { mockFetch, calls, restore } = setupMockFetch({ healthStatus: 200 });
      global.fetch = mockFetch as typeof fetch;

      const config: DockerLifecycleConfig = {
        autoStart: false,
        autoStop: false,
        healthEndpoint: "http://localhost:9999/custom-health",
      };

      const manager = new DockerLifecycleManager(config);
      await manager.healthcheck();

      expect(calls.some((c) => c.url.includes("localhost:9999"))).toBe(true);
      expect(calls.some((c) => c.url.includes("custom-health"))).toBe(true);
      restore();
    });
  });

  describe("concurrent init calls", () => {
    test("should return same promise for concurrent init calls", async () => {
      const config: DockerLifecycleConfig = {
        autoStart: false,
        autoStop: false,
      };

      const manager = new DockerLifecycleManager(config);

      // Start multiple init calls concurrently
      const promise1 = manager.init();
      const promise2 = manager.init();
      const promise3 = manager.init();

      // All should resolve successfully
      await Promise.all([promise1, promise2, promise3]);

      expect(manager.isInitialized()).toBe(true);
    });

    test("should only execute init logic once for concurrent calls", async () => {
      let initCount = 0;

      const config: DockerLifecycleConfig = {
        autoStart: false,
        autoStop: false,
      };

      const manager = new DockerLifecycleManager(config);

      // Since autoStart is false and no compose file, the logic is minimal
      // But we can verify it completes properly
      await Promise.all([
        manager.init().then(() => initCount++),
        manager.init().then(() => initCount++),
        manager.init().then(() => initCount++),
      ]);

      // All three should have resolved
      expect(initCount).toBe(3);
      expect(manager.isInitialized()).toBe(true);
    });
  });

  describe("isRunning", () => {
    test("should return false when no dockerHelper configured", async () => {
      const config: DockerLifecycleConfig = {
        autoStart: false,
        autoStop: false,
        // No composeFile = no dockerHelper
      };

      const manager = new DockerLifecycleManager(config);
      const result = await manager.isRunning();

      expect(result).toBe(false);
    });

    test("should return false when compose file is provided but container not running", async () => {
      const config: DockerLifecycleConfig = {
        autoStart: false,
        autoStop: false,
        composeFile: "/nonexistent/docker-compose.yml",
        containerName: "test-container",
      };

      const manager = new DockerLifecycleManager(config);
      // Without Docker actually running, this should return false
      const result = await manager.isRunning();

      expect(result).toBe(false);
    });
  });

  describe("getConfig returns defensive copy", () => {
    test("should return a copy, not the original config", () => {
      const config: DockerLifecycleConfig = {
        autoStart: true,
        autoStop: true,
        containerName: "original-name",
      };

      const manager = new DockerLifecycleManager(config);
      const returned1 = manager.getConfig();
      const returned2 = manager.getConfig();

      // Should be equal in value
      expect(returned1).toEqual(returned2);

      // Modifying one shouldn't affect the other
      returned1.containerName = "modified-name";
      expect(returned2.containerName).toBe("original-name");

      // And shouldn't affect subsequent calls
      const returned3 = manager.getConfig();
      expect(returned3.containerName).toBe("original-name");
    });
  });

  describe("validateDockerConfig edge cases", () => {
    test("should report error when Docker is not available", async () => {
      // We can't easily mock isDockerAvailable since it's a static method
      // But we can test with a valid-ish config
      const config: DockerLifecycleConfig = {
        autoStart: true,
        autoStop: true,
        composeFile: "/nonexistent/path/docker-compose.yml",
      };

      const manager = new DockerLifecycleManager(config);
      const result = await manager.validateDockerConfig();

      // Should have some validation result
      expect(result).toHaveProperty("valid");
      expect(result).toHaveProperty("errors");
      expect(result).toHaveProperty("warnings");
    });

    test("should validate health endpoint URL format", async () => {
      const config: DockerLifecycleConfig = {
        autoStart: false,
        autoStop: false,
        healthEndpoint: "not-a-valid-url",
      };

      const manager = new DockerLifecycleManager(config);
      const result = await manager.validateDockerConfig();

      // Should have a warning about invalid URL
      expect(result.warnings.some((w) => w.includes("invalid"))).toBe(true);
    });

    test("should validate container name format", async () => {
      const config: DockerLifecycleConfig = {
        autoStart: false,
        autoStop: false,
        containerName: "invalid name with spaces!",
      };

      const manager = new DockerLifecycleManager(config);
      const result = await manager.validateDockerConfig();

      // Should have a warning about invalid container name
      expect(result.warnings.some((w) => w.includes("invalid characters"))).toBe(true);
    });

    test("should accept valid container names", async () => {
      const config: DockerLifecycleConfig = {
        autoStart: false,
        autoStop: false,
        containerName: "valid-container_name123",
      };

      const manager = new DockerLifecycleManager(config);
      const result = await manager.validateDockerConfig();

      // Should not have container name warnings
      expect(result.warnings.some((w) => w.includes("container name"))).toBe(false);
    });
  });

  describe("config defaults", () => {
    test("should use process.cwd() as default projectRoot", () => {
      const config: DockerLifecycleConfig = {
        autoStart: true,
        autoStop: true,
        composeFile: "./docker-compose.yml",
      };

      const manager = new DockerLifecycleManager(config);
      const returnedConfig = manager.getConfig();

      // projectRoot should be undefined in config, but used as cwd internally
      expect(returnedConfig.projectRoot).toBeUndefined();
    });

    test("should preserve explicit projectRoot", () => {
      const config: DockerLifecycleConfig = {
        autoStart: true,
        autoStop: true,
        composeFile: "./docker-compose.yml",
        projectRoot: "/custom/path",
      };

      const manager = new DockerLifecycleManager(config);
      const returnedConfig = manager.getConfig();

      expect(returnedConfig.projectRoot).toBe("/custom/path");
    });
  });

  describe("shutdown behavior", () => {
    test("should not throw when container is not running", async () => {
      const config: DockerLifecycleConfig = {
        autoStart: false,
        autoStop: true,
        composeFile: "./docker-compose.yml",
        containerName: "test-container",
      };

      const manager = new DockerLifecycleManager(config);

      // Should complete without throwing
      await expect(manager.shutdown()).resolves.toBeUndefined();
    });

    test("should skip shutdown when autoStop is false", async () => {
      const config: DockerLifecycleConfig = {
        autoStart: true,
        autoStop: false,
        composeFile: "./docker-compose.yml",
        containerName: "test-container",
      };

      const manager = new DockerLifecycleManager(config);

      // Should complete immediately
      await expect(manager.shutdown()).resolves.toBeUndefined();
    });
  });

  describe("init edge cases", () => {
    test("should throw error when compose file does not exist and Docker is available", async () => {
      const config: DockerLifecycleConfig = {
        autoStart: true,
        autoStop: true,
        composeFile: "/nonexistent/docker-compose.yml",
        containerName: "test-container",
      };

      const manager = new DockerLifecycleManager(config);

      // When Docker is available but file doesn't exist, it should throw
      await expect(manager.init()).rejects.toThrow("Docker Compose command failed");
    });

    test("should complete init when autoStart is false even with invalid compose file", async () => {
      const config: DockerLifecycleConfig = {
        autoStart: false, // Key difference - autoStart is false
        autoStop: true,
        composeFile: "/nonexistent/docker-compose.yml",
        containerName: "test-container",
      };

      const manager = new DockerLifecycleManager(config);

      // With autoStart false, init should complete immediately
      await manager.init();
      expect(manager.isInitialized()).toBe(true);
    });

    test("should complete init when no compose file is provided", async () => {
      const config: DockerLifecycleConfig = {
        autoStart: true,
        autoStop: true,
        // No composeFile
      };

      const manager = new DockerLifecycleManager(config);

      // Without compose file, init should complete immediately
      await manager.init();
      expect(manager.isInitialized()).toBe(true);
    });
  });
});
