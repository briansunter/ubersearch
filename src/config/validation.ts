/**
 * Zod schemas for configuration validation
 */

import { z } from "zod";

// Base engine configuration (uses passthrough to preserve extra fields)
export const EngineConfigBaseSchema = z
  .object({
    id: z.string().min(1),
    enabled: z.boolean(),
    displayName: z.string().min(1),
    monthlyQuota: z.number().int().positive(),
    creditCostPerSearch: z.number().int().nonnegative(), // Allow 0 for free engines
    lowCreditThresholdPercent: z.number().min(0).max(100),
  })
  .passthrough();

// Docker-specific configuration
export const DockerConfigSchema = z.object({
  autoStart: z.boolean().optional(),
  autoStop: z.boolean().optional(),
  composeFile: z.string().optional(),
  containerName: z.string().optional(),
  healthEndpoint: z.string().url().optional(),
  initTimeoutMs: z.number().int().positive().optional(),
});

// Provider-specific schemas
export const TavilyConfigSchema = EngineConfigBaseSchema.extend({
  type: z.literal("tavily"),
  apiKeyEnv: z.string(),
  endpoint: z.string().url(),
  searchDepth: z.enum(["basic", "advanced"]),
});

export const BraveConfigSchema = EngineConfigBaseSchema.extend({
  type: z.literal("brave"),
  apiKeyEnv: z.string(),
  endpoint: z.string().url(),
  defaultLimit: z.number().int().positive(),
});

export const LinkupConfigSchema = EngineConfigBaseSchema.extend({
  type: z.literal("linkup"),
  apiKeyEnv: z.string(),
  endpoint: z.string().url(),
}).merge(DockerConfigSchema);

export const SearchxngConfigSchema = EngineConfigBaseSchema.extend({
  type: z.literal("searchxng"),
  apiKeyEnv: z.string().optional(),
  endpoint: z.string().url(),
  defaultLimit: z.number().int().positive(),
}).merge(DockerConfigSchema);

// Union type for all engine configs
export const EngineConfigSchema = z.discriminatedUnion("type", [
  TavilyConfigSchema,
  BraveConfigSchema,
  LinkupConfigSchema,
  SearchxngConfigSchema,
]);

// Main configuration schema (uses passthrough to preserve extra fields)
export const UberSearchConfigSchema = z
  .object({
    defaultEngineOrder: z.array(z.string()).min(1),
    engines: z.array(EngineConfigSchema).min(1),
    storage: z
      .object({
        creditStatePath: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

// CLI input schema
export const CliInputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().optional(),
  engines: z.array(z.string()).min(1).optional(),
  includeRaw: z.boolean().optional(),
  strategy: z.enum(["all", "first-success"]).optional(),
  json: z.boolean().optional(),
});

// Export inferred types from schemas
export type ValidatedUberSearchConfig = z.infer<typeof UberSearchConfigSchema>;
export type ValidatedEngineConfig = z.infer<typeof EngineConfigSchema>;
export type ValidatedTavilyConfig = z.infer<typeof TavilyConfigSchema>;
export type ValidatedBraveConfig = z.infer<typeof BraveConfigSchema>;
export type ValidatedLinkupConfig = z.infer<typeof LinkupConfigSchema>;
export type ValidatedSearchxngConfig = z.infer<typeof SearchxngConfigSchema>;
export type ValidatedCliInput = z.infer<typeof CliInputSchema>;

/**
 * Validate configuration against schema
 * @param config - Raw configuration object
 * @returns Validated configuration
 * @throws ZodError if validation fails
 */
export function validateConfig(config: unknown): ValidatedUberSearchConfig {
  return UberSearchConfigSchema.parse(config);
}

/**
 * Validate configuration safely (returns result object instead of throwing)
 * @param config - Raw configuration object
 * @returns Result object with success status and data or error
 */
export function validateConfigSafe(config: unknown):
  | {
      success: true;
      data: ValidatedUberSearchConfig;
    }
  | {
      success: false;
      error: z.ZodError;
    } {
  const result = UberSearchConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Validate CLI input against schema
 * @param input - Raw CLI input object
 * @returns Validated CLI input
 * @throws ZodError if validation fails
 */
export function validateCliInput(input: unknown): ValidatedCliInput {
  return CliInputSchema.parse(input);
}

/**
 * Format Zod validation errors into human-readable messages
 * @param error - ZodError from validation
 * @returns Array of formatted error messages
 */
export function formatValidationErrors(error: z.ZodError): string[] {
  return error.issues.map((err) => {
    const path = err.path.join(".");
    return path ? `${path}: ${err.message}` : err.message;
  });
}
