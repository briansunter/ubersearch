/**
 * Docker Compose Helper
 *
 * Manages Docker Compose services for local providers
 */

import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface DockerComposeOptions {
  cwd?: string;
  timeout?: number;
}

/**
 * Helper for managing Docker Compose services
 */
export class DockerComposeHelper {
  constructor(private composeFile: string) {}

  /**
   * Execute docker compose command
   */
  private async execDockerCompose(
    args: string[],
    options: DockerComposeOptions = {},
  ): Promise<string> {
    const cmd = `docker compose -f "${this.composeFile}" ${args.join(" ")}`;
    const cwd = options.cwd || this.getComposeDir();
    const timeout = options.timeout || 30000;

    try {
      const { stdout, stderr } = await execAsync(cmd, {
        cwd,
        timeout,
        env: { ...process.env },
      });

      if (stderr && !stderr.includes("warning")) {
        console.warn(`Docker Compose warning: ${stderr}`);
      }

      return stdout;
    } catch (error: unknown) {
      const err = error as { message?: string; stdout?: string; stderr?: string };
      const errorMessage = err.message ?? "Unknown error";
      const timedOut = errorMessage.includes("timed out") || errorMessage.includes("ETIMEDOUT");

      const errorDetails = [
        `Docker Compose command ${timedOut ? "timed out" : "failed"}: ${errorMessage}`,
        `Command: ${cmd}`,
      ];
      if (err.stdout) {
        errorDetails.push(`Output: ${err.stdout}`);
      }
      if (err.stderr) {
        errorDetails.push(`Error: ${err.stderr}`);
      }

      throw new Error(errorDetails.join("\n"));
    }
  }

  /**
   * Get directory containing compose file
   */
  private getComposeDir(): string {
    return require("node:path").dirname(this.composeFile);
  }

  /**
   * Start services
   * @param services Optional list of services to start
   */
  async up(services?: string[], options?: DockerComposeOptions): Promise<void> {
    const args = ["up", "-d"];
    if (services && services.length > 0) {
      args.push(...services);
    }

    await this.execDockerCompose(args, options);
  }

  /**
   * Stop services
   * @param services Optional list of services to stop
   */
  async stop(services?: string[], options?: DockerComposeOptions): Promise<void> {
    const args = ["stop"];
    if (services && services.length > 0) {
      args.push(...services);
    }

    await this.execDockerCompose(args, options);
  }

  /**
   * Stop and remove containers
   */
  async down(options?: DockerComposeOptions): Promise<void> {
    await this.execDockerCompose(["down"], options);
  }

  /**
   * Get service logs
   * @param services Optional list of services
   * @param tail Number of lines to show (default: 50)
   */
  async logs(
    services?: string[],
    tail: number = 50,
    options?: DockerComposeOptions,
  ): Promise<string> {
    const args = ["logs", "--tail", String(tail)];
    if (services && services.length > 0) {
      args.push(...services);
    }

    return await this.execDockerCompose(args, options);
  }

  /**
   * List running services
   */
  async ps(options?: DockerComposeOptions): Promise<string> {
    return await this.execDockerCompose(["ps"], options);
  }

  /**
   * Check if services are running
   * @param service Optional specific service to check
   */
  async isRunning(service?: string, options?: DockerComposeOptions): Promise<boolean> {
    try {
      const output = await this.ps(options);

      if (service) {
        return output.includes(service) && !output.includes("Exit");
      }

      // Check if any services are running
      return output.includes("Up");
    } catch (_error) {
      return false;
    }
  }

  /**
   * Check if Docker is available
   */
  static async isDockerAvailable(): Promise<boolean> {
    try {
      await execAsync("docker version", { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if compose file exists
   */
  composeFileExists(): boolean {
    return existsSync(this.composeFile);
  }
}
