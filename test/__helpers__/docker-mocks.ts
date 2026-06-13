/**
 * Docker Mocking Utilities for Testing
 *
 * Provides mock implementations for Docker-related components
 * to enable fast, reliable unit tests without requiring Docker.
 */

import { type Mock, mock } from "bun:test";
import type { ExecOptions } from "node:child_process";
import type { DockerLifecycleConfig } from "../../src/core/docker/dockerLifecycleManager";

// ============ Types ============

export interface MockExecResult {
  stdout: string;
  stderr: string;
}

export interface MockExecCall {
  command: string;
  options?: { cwd?: string; timeout?: number };
}

export interface DockerCommandMocks {
  version?: MockExecResult | Error;
  up?: MockExecResult | Error;
  stop?: MockExecResult | Error;
  down?: MockExecResult | Error;
  ps?: MockExecResult | Error;
  logs?: MockExecResult | Error;
}

export interface MockDockerHelperOptions {
  /** Responses for different Docker commands */
  commands?: DockerCommandMocks;
  /** Whether compose file exists */
  composeFileExists?: boolean;
  /** Whether Docker is available */
  dockerAvailable?: boolean;
}

export interface MockLifecycleManagerOptions {
  /** Return value for healthcheck() */
  isHealthy?: boolean;
  /** Whether init() should fail */
  shouldFailInit?: boolean;
  /** Error message for init failure */
  initErrorMessage?: string;
  /** Whether healthcheck() should fail */
  shouldFailHealthcheck?: boolean;
  /** Whether shutdown() should fail */
  shouldFailShutdown?: boolean;
  /** Whether isRunning() returns true */
  isRunning?: boolean;
  /** Validation result */
  validationResult?: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
}

// ============ Mock exec ============

/**
 * Creates a mock for child_process.exec that returns configurable responses
 * based on the Docker command being executed.
 */
export function createMockExec(options: MockDockerHelperOptions = {}): {
  mockExec: Mock<(cmd: string, opts?: ExecOptions) => Promise<MockExecResult>>;
  calls: MockExecCall[];
} {
  const calls: MockExecCall[] = [];
  const commands = options.commands ?? {};
  const dockerAvailable = options.dockerAvailable ?? true;

  const mockExec = mock(async (cmd: string, opts?: ExecOptions): Promise<MockExecResult> => {
    calls.push({ command: cmd, options: opts as { cwd?: string; timeout?: number } | undefined });

    // Docker version check
    if (cmd.includes("docker version")) {
      if (!dockerAvailable) {
        throw new Error("Docker is not running");
      }
      if (commands.version instanceof Error) {
        throw commands.version;
      }
      return commands.version ?? { stdout: "Docker version 24.0.0", stderr: "" };
    }

    // Docker compose commands
    if (cmd.includes("docker compose")) {
      if (cmd.includes(" up ")) {
        if (commands.up instanceof Error) {
          throw commands.up;
        }
        return commands.up ?? { stdout: "Container started", stderr: "" };
      }
      if (cmd.includes(" stop")) {
        if (commands.stop instanceof Error) {
          throw commands.stop;
        }
        return commands.stop ?? { stdout: "Container stopped", stderr: "" };
      }
      if (cmd.includes(" down")) {
        if (commands.down instanceof Error) {
          throw commands.down;
        }
        return commands.down ?? { stdout: "Container removed", stderr: "" };
      }
      if (cmd.includes(" ps")) {
        if (commands.ps instanceof Error) {
          throw commands.ps;
        }
        return commands.ps ?? { stdout: "searxng   Up 5 minutes", stderr: "" };
      }
      if (cmd.includes(" logs")) {
        if (commands.logs instanceof Error) {
          throw commands.logs;
        }
        return commands.logs ?? { stdout: "Container logs here", stderr: "" };
      }
    }

    // Unknown command
    return { stdout: "", stderr: "" };
  });

  return { mockExec, calls };
}

// ============ Mock fetch for health checks ============

export interface MockFetchOptions {
  /** Health endpoint response status */
  healthStatus?: number;
  /** Whether health endpoint should timeout */
  healthTimeout?: boolean;
  /** Health endpoint response body */
  healthBody?: unknown;
  /** Search endpoint responses */
  searchResponses?: Map<string, { status: number; body: unknown }>;
}

/**
 * Creates a mock fetch function for testing health checks and API calls
 */
export function createMockFetch(options: MockFetchOptions = {}): {
  mockFetch: Mock<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>;
  calls: { url: string; init?: RequestInit }[];
} {
  const calls: { url: string; init?: RequestInit }[] = [];
  const healthStatus = options.healthStatus ?? 200;
  const healthTimeout = options.healthTimeout ?? false;

  const mockFetch = mock(
    async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push({ url, init });

      // Health check endpoint
      if (url.includes("/health") || url.includes(":8080")) {
        if (healthTimeout) {
          throw new Error("Request timeout");
        }
        return new Response(JSON.stringify(options.healthBody ?? { status: "ok" }), {
          status: healthStatus,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Search endpoint
      if (url.includes("/search")) {
        const searchResponses = options.searchResponses;
        if (searchResponses) {
          for (const [pattern, response] of searchResponses.entries()) {
            if (url.includes(pattern)) {
              return new Response(JSON.stringify(response.body), {
                status: response.status,
                headers: { "Content-Type": "application/json" },
              });
            }
          }
        }
        // Default search response
        return new Response(
          JSON.stringify({
            results: [
              { title: "Test Result", url: "https://example.com", content: "Test content" },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Unknown endpoint
      return new Response("Not Found", { status: 404 });
    },
  );

  return { mockFetch, calls };
}

// ============ Mock DockerComposeHelper ============

/**
 * Mock implementation of DockerComposeHelper for unit testing
 */
export class MockDockerComposeHelper {
  public calls: { method: string; args: unknown[] }[] = [];
  private options: MockDockerHelperOptions;

  constructor(
    public readonly composeFile: string,
    options: MockDockerHelperOptions = {},
  ) {
    this.options = options;
  }

  private recordCall(method: string, ...args: unknown[]): void {
    this.calls.push({ method, args });
  }

  async up(services?: string[], options?: { cwd?: string }): Promise<void> {
    this.recordCall("up", services, options);
    const result = this.options.commands?.up;
    if (result instanceof Error) {
      throw result;
    }
  }

  async stop(services?: string[], options?: { cwd?: string }): Promise<void> {
    this.recordCall("stop", services, options);
    const result = this.options.commands?.stop;
    if (result instanceof Error) {
      throw result;
    }
  }

  async down(options?: { cwd?: string }): Promise<void> {
    this.recordCall("down", options);
    const result = this.options.commands?.down;
    if (result instanceof Error) {
      throw result;
    }
  }

  async ps(options?: { cwd?: string }): Promise<string> {
    this.recordCall("ps", options);
    const result = this.options.commands?.ps;
    if (result instanceof Error) {
      throw result;
    }
    return (result as MockExecResult)?.stdout ?? "searxng   Up 5 minutes";
  }

  async logs(services?: string[], tail?: number, options?: { cwd?: string }): Promise<string> {
    this.recordCall("logs", services, tail, options);
    const result = this.options.commands?.logs;
    if (result instanceof Error) {
      throw result;
    }
    return (result as MockExecResult)?.stdout ?? "Container logs";
  }

  async isRunning(service?: string, options?: { cwd?: string }): Promise<boolean> {
    this.recordCall("isRunning", service, options);
    const psResult = this.options.commands?.ps;
    if (psResult instanceof Error) {
      return false;
    }
    const output = (psResult as MockExecResult)?.stdout ?? "searxng   Up 5 minutes";
    return output.includes("Up") && !output.includes("Exit");
  }

  composeFileExists(): boolean {
    return this.options.composeFileExists ?? true;
  }

  static async isDockerAvailable(): Promise<boolean> {
    return true; // Override in individual tests if needed
  }
}

// ============ Mock DockerLifecycleManager ============

/**
 * Creates a mock DockerLifecycleManager for unit testing
 */
export function createMockDockerLifecycleManager(
  config: Partial<DockerLifecycleConfig> = {},
  options: MockLifecycleManagerOptions = {},
): MockDockerLifecycleManager {
  return new MockDockerLifecycleManager(
    {
      autoStart: config.autoStart ?? false,
      autoStop: config.autoStop ?? false,
      containerName: config.containerName,
      composeFile: config.composeFile,
      healthEndpoint: config.healthEndpoint,
      initTimeoutMs: config.initTimeoutMs,
      projectRoot: config.projectRoot,
    },
    options,
  );
}

/**
 * Mock implementation of DockerLifecycleManager
 */
export class MockDockerLifecycleManager {
  public calls: { method: string; args?: unknown[] }[] = [];
  private _initialized = false;
  private options: MockLifecycleManagerOptions;
  private config: DockerLifecycleConfig;

  constructor(config: DockerLifecycleConfig, options: MockLifecycleManagerOptions = {}) {
    this.config = config;
    this.options = options;
  }

  async init(): Promise<void> {
    this.calls.push({ method: "init" });
    if (this.options.shouldFailInit) {
      throw new Error(this.options.initErrorMessage ?? "Init failed");
    }
    this._initialized = true;
  }

  async healthcheck(): Promise<boolean> {
    this.calls.push({ method: "healthcheck" });
    if (this.options.shouldFailHealthcheck) {
      throw new Error("Healthcheck failed");
    }
    return this.options.isHealthy ?? true;
  }

  async shutdown(): Promise<void> {
    this.calls.push({ method: "shutdown" });
    if (this.options.shouldFailShutdown) {
      throw new Error("Shutdown failed");
    }
  }

  async validateDockerConfig(): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    this.calls.push({ method: "validateDockerConfig" });
    return (
      this.options.validationResult ?? {
        valid: true,
        errors: [],
        warnings: [],
      }
    );
  }

  isInitialized(): boolean {
    return this._initialized;
  }

  async isRunning(): Promise<boolean> {
    this.calls.push({ method: "isRunning" });
    return this.options.isRunning ?? false;
  }

  getConfig(): DockerLifecycleConfig {
    return { ...this.config };
  }

  // Test helpers
  setHealthy(healthy: boolean): void {
    this.options.isHealthy = healthy;
  }

  setRunning(running: boolean): void {
    this.options.isRunning = running;
  }

  resetCalls(): void {
    this.calls = [];
  }
}

// ============ Test Data Factories ============

/**
 * Create a default SearXNG config for testing
 */
export function createTestSearchxngConfig(overrides: Record<string, unknown> = {}): {
  id: string;
  type: "searchxng";
  enabled: boolean;
  displayName: string;
  apiKeyEnv: string;
  endpoint: string;
  defaultLimit: number;
  autoStart: boolean;
  autoStop: boolean;
  containerName: string;
  composeFile: string;
  healthEndpoint: string;
  initTimeoutMs: number;
  monthlyQuota: number;
  creditCostPerSearch: number;
  lowCreditThresholdPercent: number;
} {
  return {
    id: "searchxng",
    type: "searchxng" as const,
    enabled: true,
    displayName: "SearXNG (Local)",
    apiKeyEnv: "SEARXNG_API_KEY",
    endpoint: "http://localhost:8888/search",
    defaultLimit: 10,
    autoStart: false,
    autoStop: false,
    containerName: "searxng",
    composeFile: "./providers/searxng/docker-compose.yml",
    healthEndpoint: "http://localhost:8080/health",
    initTimeoutMs: 60000,
    monthlyQuota: 10000,
    creditCostPerSearch: 0,
    lowCreditThresholdPercent: 10,
    ...overrides,
  };
}

/**
 * Create a mock SearXNG API response
 */
export function createMockSearxngResponse(
  options: {
    resultCount?: number;
    includeEngine?: boolean;
    includeScore?: boolean;
    includeRank?: boolean;
  } = {},
): {
  results: Array<{
    title: string;
    url: string;
    content?: string;
    description?: string;
    score?: number;
    rank?: number;
    engine?: string;
  }>;
} {
  const count = options.resultCount ?? 3;
  type MockSearxngResult = {
    title: string;
    url: string;
    content?: string;
    description?: string;
    score?: number;
    rank?: number;
    engine?: string;
  };

  const results: MockSearxngResult[] = Array.from({ length: count }, (_, i) => {
    const result: MockSearxngResult = {
      title: `Result ${i + 1}`,
      url: `https://example${i + 1}.com`,
      content: `Content for result ${i + 1}`,
    };

    if (options.includeEngine) {
      result.engine = ["google", "bing", "duckduckgo"][i % 3];
    }
    if (options.includeScore) {
      result.score = 1 - i * 0.1;
    }
    if (options.includeRank) {
      result.rank = i + 1;
    }

    return result;
  });

  return { results };
}

// ============ Module Mocking Helpers ============

/**
 * Store original globals for restoration
 */
let originalFetch: typeof fetch | undefined;
let originalEnv: NodeJS.ProcessEnv | undefined;

/**
 * Set up mocked fetch for a test
 */
export function setupMockFetch(options: MockFetchOptions = {}): {
  mockFetch: Mock<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>;
  calls: { url: string; init?: RequestInit }[];
  restore: () => void;
} {
  originalFetch = global.fetch;
  const { mockFetch, calls } = createMockFetch(options);
  global.fetch = mockFetch as unknown as typeof fetch;

  return {
    mockFetch,
    calls,
    restore: () => {
      if (originalFetch) {
        global.fetch = originalFetch;
      }
    },
  };
}

/**
 * Set up test environment variables
 */
export function setupTestEnv(env: Record<string, string> = {}): {
  restore: () => void;
} {
  originalEnv = { ...process.env };
  Object.assign(process.env, env);

  return {
    restore: () => {
      if (originalEnv) {
        process.env = originalEnv;
      }
    },
  };
}

// ============ Assertion Helpers ============

/**
 * Assert that a mock was called with specific Docker command
 */
export function assertDockerCommandCalled(
  calls: MockExecCall[],
  commandPart: string,
  options?: { cwd?: string },
): void {
  const matchingCall = calls.find((call) => {
    if (!call.command.includes(commandPart)) {
      return false;
    }
    if (options?.cwd && call.options?.cwd !== options.cwd) {
      return false;
    }
    return true;
  });

  if (!matchingCall) {
    const callList = calls.map((c) => c.command).join("\n  ");
    throw new Error(
      `Expected Docker command containing '${commandPart}' but got:\n  ${callList || "(no calls)"}`,
    );
  }
}

/**
 * Assert that a method was called on a mock lifecycle manager
 */
export function assertLifecycleMethodCalled(
  manager: MockDockerLifecycleManager,
  method: string,
  times?: number,
): void {
  const matchingCalls = manager.calls.filter((c) => c.method === method);

  if (times !== undefined && matchingCalls.length !== times) {
    throw new Error(
      `Expected ${method}() to be called ${times} times but was called ${matchingCalls.length} times`,
    );
  }

  if (matchingCalls.length === 0) {
    const callList = manager.calls.map((c) => c.method).join(", ");
    throw new Error(`Expected ${method}() to be called but got: [${callList || "no calls"}]`);
  }
}
