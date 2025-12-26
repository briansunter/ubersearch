/**
 * Docker Lifecycle Manager
 *
 * Handles Docker container lifecycle operations independently from search logic.
 * Enables composition over inheritance for providers that need Docker management.
 *
 * @example
 * ```typescript
 * const dockerManager = new DockerLifecycleManager({
 *   composeFile: './docker-compose.yml',
 *   containerName: 'my-service',
 *   healthEndpoint: 'http://localhost:8080/health',
 *   autoStart: true,
 *   autoStop: true
 * });
 *
 * await dockerManager.init();
 * const isHealthy = await dockerManager.healthcheck();
 * await dockerManager.shutdown();
 * ```
 */

import { createLogger } from "../logger";
import { bootstrapSearxngConfig } from "../paths";
import { DockerComposeHelper } from "./dockerComposeHelper";

const log = createLogger("DockerLifecycle");

export interface DockerLifecycleConfig {
  containerName?: string;
  composeFile?: string;
  healthEndpoint?: string;
  autoStart: boolean;
  autoStop: boolean;
  initTimeoutMs?: number;
  projectRoot?: string; // Base path for resolving relative compose file paths
}

/**
 * Manages Docker container lifecycle operations for providers
 */
export class DockerLifecycleManager {
  private config: DockerLifecycleConfig;
  private dockerHelper?: DockerComposeHelper;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: DockerLifecycleConfig) {
    this.config = config;

    // Initialize Docker helper if compose file is provided
    if (config.composeFile) {
      this.dockerHelper = new DockerComposeHelper(config.composeFile);
    }
  }

  /**
   * Initialize the Docker lifecycle manager
   *
   * Auto-starts containers if configured and performs health checks.
   * Thread-safe - multiple calls return the same promise.
   *
   * @throws Error if container startup fails
   */
  async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    if (!this.config.autoStart || !this.dockerHelper) {
      this.initialized = true;
      return;
    }

    this.initPromise = this.performInit().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      log.debug("Initialization failed:", message);
      this.initialized = false;
      throw error;
    });
    return this.initPromise;
  }

  /**
   * Wrap a promise with a timeout
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operation: string,
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  private async performInit(): Promise<void> {
    if (!this.dockerHelper) {
      return;
    }

    // Bootstrap SearXNG config if needed (copy default settings.yml)
    bootstrapSearxngConfig();

    // Check if Docker is available (with timeout)
    const dockerAvailable = await this.withTimeout(
      DockerComposeHelper.isDockerAvailable(),
      10000,
      "Docker availability check",
    );
    if (!dockerAvailable) {
      log.debug("Docker is not available. Cannot auto-start container.");
      this.initialized = true;
      return;
    }

    // Check if container is already running (with timeout)
    const isRunning = await this.withTimeout(this.healthcheck(), 5000, "Initial health check");
    if (isRunning) {
      log.debug("Container is already running.");
      this.initialized = true;
      return;
    }

    // Auto-start container
    log.debug("Starting Docker container...");
    try {
      // Run from project root to ensure correct path resolution
      const projectRoot = this.config.projectRoot || process.cwd();
      await this.dockerHelper.up(
        this.config.containerName ? [this.config.containerName] : undefined,
        { cwd: projectRoot },
      );
      log.debug("Container started successfully.");

      // Wait for health check if endpoint is configured
      if (this.config.healthEndpoint) {
        await this.waitForHealth();
      }

      this.initialized = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.debug("Failed to start container:", message);
      throw error;
    } finally {
      this.initPromise = null;
    }
  }

  /**
   * Check if container is healthy
   *
   * Checks both container running status and health endpoint if configured.
   *
   * @returns true if container is healthy, false otherwise
   */
  async healthcheck(): Promise<boolean> {
    // Check if container is running
    if (this.dockerHelper) {
      const projectRoot = this.config.projectRoot || process.cwd();
      const isRunning = await this.dockerHelper.isRunning(this.config.containerName, {
        cwd: projectRoot,
      });
      if (!isRunning) {
        return false;
      }
    }

    // Check health endpoint if configured
    if (this.config.healthEndpoint) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(this.config.healthEndpoint, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return response.ok;
      } catch {
        return false;
      }
    }

    // If no health endpoint, assume healthy if initialized
    return this.initialized;
  }

  /**
   * Wait for health endpoint to be ready
   */
  private async waitForHealth(timeoutMs: number = 30000): Promise<void> {
    if (!this.config.healthEndpoint) {
      return;
    }

    log.debug("Waiting for health check...");

    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      if (await this.healthcheck()) {
        log.debug("Health check passed.");
        return;
      }

      await this.sleep(1000);
    }

    throw new Error(
      `[DockerLifecycleManager] Health check failed after ${timeoutMs}ms. ` +
        `Endpoint: ${this.config.healthEndpoint}`,
    );
  }

  /**
   * Shutdown Docker lifecycle manager
   *
   * Stops containers if autoStop is enabled. Errors during shutdown are logged
   * but not thrown to prevent cleanup failures from propagating.
   */
  async shutdown(): Promise<void> {
    if (!this.config.autoStop || !this.dockerHelper) {
      return;
    }

    const projectRoot = this.config.projectRoot || process.cwd();
    const isRunning = await this.dockerHelper.isRunning(this.config.containerName, {
      cwd: projectRoot,
    });
    if (!isRunning) {
      return;
    }

    log.debug("Stopping Docker container...");
    try {
      await this.dockerHelper.stop(
        this.config.containerName ? [this.config.containerName] : undefined,
        { cwd: projectRoot },
      );
      log.debug("Container stopped.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.debug("Failed to stop container:", message);
      // Don't throw on shutdown errors
    }
  }

  /**
   * Validate Docker configuration
   *
   * Performs comprehensive validation of Docker configuration including:
   * - Docker availability
   * - Compose file existence and validity
   * - Health endpoint URL validation
   * - Container name format validation
   *
   * @returns Validation results with errors and warnings
   */
  async validateDockerConfig(): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check Docker is available
    const dockerAvailable = await DockerComposeHelper.isDockerAvailable();
    if (!dockerAvailable) {
      errors.push("Docker is not available or not running");
      return { valid: false, errors, warnings };
    }

    // Check compose file exists
    if (this.config.composeFile) {
      const composeExists = await this.dockerHelper?.composeFileExists();
      if (!composeExists) {
        errors.push(`Compose file not found: ${this.config.composeFile}`);
      }
    }

    // Check if compose file is valid
    if (this.dockerHelper) {
      try {
        const projectRoot = this.config.projectRoot || process.cwd();
        await this.dockerHelper.ps({ cwd: projectRoot });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("config")) {
          errors.push(`Invalid compose file: ${message}`);
        }
      }
    }

    // Check health endpoint if configured
    if (this.config.healthEndpoint) {
      try {
        // Try to parse the URL
        new URL(this.config.healthEndpoint);
      } catch {
        warnings.push(`Health endpoint URL is invalid: ${this.config.healthEndpoint}`);
      }
    }

    // Check container name if specified
    if (this.config.containerName && !/^[a-zA-Z0-9_-]+$/.test(this.config.containerName)) {
      warnings.push(`Container name contains invalid characters: ${this.config.containerName}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Helper: Sleep for ms milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if lifecycle manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if container is running
   *
   * @returns true if container is running, false otherwise
   */
  async isRunning(): Promise<boolean> {
    if (!this.dockerHelper) {
      return false;
    }

    try {
      const projectRoot = this.config.projectRoot || process.cwd();
      return await this.dockerHelper.isRunning(this.config.containerName, {
        cwd: projectRoot,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.debug("Error checking if container is running:", message);
      return false;
    }
  }

  /**
   * Get the current configuration
   *
   * @returns Current Docker lifecycle configuration
   */
  getConfig(): DockerLifecycleConfig {
    return { ...this.config };
  }
}
