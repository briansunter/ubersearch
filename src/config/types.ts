/**
 * Configuration types for ai-search
 */

import type { EngineId } from "../core/types";

/**
 * Docker configuration options for providers that can manage container lifecycle
 */
export interface DockerConfigurable {
  /** Whether to auto-start the container on init */
  autoStart?: boolean;
  /** Whether to auto-stop the container on shutdown */
  autoStop?: boolean;
  /** Path to docker-compose file */
  composeFile?: string;
  /** Name of the container to manage */
  containerName?: string;
  /** Health check endpoint URL */
  healthEndpoint?: string;
  /** Timeout for initialization in milliseconds */
  initTimeoutMs?: number;
}

export interface EngineConfigBase {
  /** Unique identifier for this engine */
  id: EngineId;

  /** Whether this engine is enabled */
  enabled: boolean;

  /** Human-readable display name */
  displayName: string;

  /** Monthly query quota */
  monthlyQuota: number;

  /** Credit cost per search */
  creditCostPerSearch: number;

  /** Warning threshold (percentage of quota used) */
  lowCreditThresholdPercent: number;
}

export interface TavilyConfig extends EngineConfigBase {
  type: "tavily";
  apiKeyEnv: string;
  endpoint: string;
  searchDepth: "basic" | "advanced";
}

export interface BraveConfig extends EngineConfigBase {
  type: "brave";
  apiKeyEnv: string;
  endpoint: string;
  defaultLimit: number;
}

export interface LinkupConfig extends EngineConfigBase, DockerConfigurable {
  type: "linkup";
  apiKeyEnv: string;
  endpoint: string;
}

export interface SearchxngConfig extends EngineConfigBase, DockerConfigurable {
  type: "searchxng";
  apiKeyEnv?: string;
  endpoint: string;
  defaultLimit: number;
}

export type EngineConfig = TavilyConfig | BraveConfig | LinkupConfig | SearchxngConfig;

export interface AiSearchConfig {
  /** Default order to try engines (can be overridden per query) */
  defaultEngineOrder: EngineId[];

  /** Configuration for each search provider */
  engines: EngineConfig[];

  /** Storage settings */
  storage?: {
    /** Path to store credit state (defaults to ~/.local/state/ai-search/credits.json) */
    creditStatePath?: string;
  };
}
