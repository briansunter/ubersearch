/**
 * XDG Base Directory utilities
 *
 * Provides standard paths following XDG Base Directory Specification
 * https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html
 */

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_NAME = "ubersearch";

/**
 * Get XDG config home directory
 * Default: ~/.config
 */
export function getXdgConfigHome(): string {
  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

/**
 * Get XDG data home directory
 * Default: ~/.local/share
 */
export function getXdgDataHome(): string {
  return process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
}

/**
 * Get XDG state home directory
 * Default: ~/.local/state
 */
export function getXdgStateHome(): string {
  return process.env.XDG_STATE_HOME || join(homedir(), ".local", "state");
}

/**
 * Get app config directory
 * ~/.config/ubersearch
 */
export function getAppConfigDir(): string {
  return join(getXdgConfigHome(), APP_NAME);
}

/**
 * Get app data directory
 * ~/.local/share/ubersearch
 */
export function getAppDataDir(): string {
  return join(getXdgDataHome(), APP_NAME);
}

/**
 * Get SearXNG config directory
 * ~/.config/ubersearch/searxng/config
 */
export function getSearxngConfigDir(): string {
  return join(getAppConfigDir(), "searxng", "config");
}

/**
 * Get SearXNG data directory
 * ~/.local/share/ubersearch/searxng/data
 */
export function getSearxngDataDir(): string {
  return join(getAppDataDir(), "searxng", "data");
}

/**
 * Ensure a directory exists, creating it if necessary
 */
export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Get all SearXNG paths and ensure directories exist
 */
export function getSearxngPaths(): { configDir: string; dataDir: string } {
  const configDir = getSearxngConfigDir();
  const dataDir = getSearxngDataDir();

  ensureDir(configDir);
  ensureDir(dataDir);

  return { configDir, dataDir };
}

/**
 * Get package root directory
 * Handles both development (src/) and bundled (dist/) environments
 */
export function getPackageRoot(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);

  // Check if we're in dist/ or src/
  if (currentDir.includes("/dist")) {
    // Bundled: dist/core/paths.js or dist/cli.js -> find dist root
    const distIndex = currentDir.indexOf("/dist");
    return currentDir.substring(0, distIndex + 5); // Include /dist
  }
  // Development: src/core/paths.ts -> go up 2 levels to package root
  return dirname(dirname(currentDir));
}

/**
 * Get the bundled default settings.yml path
 */
export function getDefaultSettingsPath(): string {
  const packageRoot = getPackageRoot();
  // In bundled mode, look in dist/providers/searxng/
  // In dev mode, look in providers/searxng/
  if (packageRoot.endsWith("/dist")) {
    return join(packageRoot, "providers", "searxng", "config", "settings.yml");
  }
  return join(packageRoot, "providers", "searxng", "config", "settings.yml");
}

/**
 * Bootstrap SearXNG config by copying default settings if not present
 * @returns true if config was bootstrapped, false if already exists
 */
export function bootstrapSearxngConfig(): boolean {
  const { configDir } = getSearxngPaths();
  const targetSettings = join(configDir, "settings.yml");

  // If settings already exist, don't overwrite
  if (existsSync(targetSettings)) {
    return false;
  }

  const defaultSettings = getDefaultSettingsPath();

  // If default settings don't exist, we can't bootstrap
  if (!existsSync(defaultSettings)) {
    console.warn(
      `[SearXNG] Default settings not found at ${defaultSettings}. ` +
        `Please create ${targetSettings} manually.`,
    );
    return false;
  }

  // Copy default settings to XDG config dir
  try {
    copyFileSync(defaultSettings, targetSettings);
    console.log(`[SearXNG] Bootstrapped default config to ${targetSettings}`);
    return true;
  } catch (error) {
    console.error(`[SearXNG] Failed to bootstrap config:`, error);
    return false;
  }
}
