/**
 * Pure argument parsers for MCP tool inputs.
 *
 * These functions translate the loosely-typed arguments delivered by an MCP
 * client into the typed shapes our tool handlers expect. They throw on invalid
 * input with messages prefixed `Invalid params:` so the dispatch layer can map
 * them to the JSON-RPC `-32602` error code.
 */

export function parseOptionalCommaList(paramName: string, value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const rawValues = typeof value === "string" ? value.split(",") : value;
  if (!Array.isArray(rawValues)) {
    throw new Error(`Invalid params: '${paramName}' must be a comma-separated string`);
  }

  const values: string[] = [];
  for (const item of rawValues) {
    if (typeof item !== "string") {
      throw new Error(`Invalid params: '${paramName}' must contain only strings`);
    }

    const trimmed = item.trim();
    if (trimmed.length > 0) {
      values.push(trimmed);
    }
  }

  return values.length > 0 ? values : undefined;
}

export function parseLimit(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error("Invalid params: 'limit' must be a positive integer");
    }
    return value;
  }

  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value.trim())) {
    throw new Error("Invalid params: 'limit' must be a positive integer");
  }

  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Invalid params: 'limit' must be a positive integer");
  }

  return limit;
}

export type SearchStrategyName = "all" | "first-success";

export function parseStrategy(value: unknown): SearchStrategyName | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (value === "all" || value === "first-success") {
    return value;
  }

  throw new Error("Invalid params: 'strategy' must be 'all' or 'first-success'");
}
