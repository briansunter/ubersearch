/**
 * Declarative registry of MCP tools exposed by the ubersearch server.
 *
 * Each entry is self-contained: name, description, JSON Schema for inputs, and
 * a handler that takes the raw JSON-RPC arguments plus a DI container. Adding
 * a new tool is a one-line append plus a handler — no edits to the dispatch
 * loop required.
 */

import type { Container } from "../core/container";
import { handleCredits, handleHealth, handleUberSearch } from "./handlers";
import { parseLimit, parseOptionalCommaList, parseStrategy } from "./parseArgs";

const MAX_QUERY_LENGTH = 2000;

export type ToolHandler = (args: Record<string, unknown>, container: Container) => Promise<unknown>;

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly handler: ToolHandler;
}

const uberSearchTool: ToolDefinition = {
  name: "uber_search",
  description: "Unified search across multiple providers (Tavily, Brave, Linkup, SearXNG)",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query",
      },
      engines: {
        type: "string",
        description: "Comma-separated list of engines to use (e.g., 'tavily,brave')",
        default: "",
      },
      strategy: {
        type: "string",
        enum: ["all", "first-success"],
        description: "Search strategy: 'all' (query all) or 'first-success' (stop after first)",
        default: "first-success",
      },
      limit: {
        type: "number",
        description: "Maximum results per engine",
        default: 10,
      },
      categories: {
        type: "string",
        description: `SearXNG categories (comma-separated). Available categories:
- general: Web search (brave, duckduckgo, startpage, qwant)
- it: Tech (github, stackoverflow, npm, pypi, huggingface)
- science: Academic (arxiv, google_scholar)
- news: News (hackernews, reddit, bbc)
- videos: Video (youtube)
Example: "it,science" for tech and academic results`,
        default: "",
      },
    },
    required: ["query"],
  },
  handler: async (args, container) => {
    const query = typeof args.query === "string" ? args.query : "";
    if (query.trim() === "") {
      throw new Error("Invalid params: 'query' is required and must be non-empty");
    }
    if (query.length > MAX_QUERY_LENGTH) {
      throw new Error(
        `Invalid params: query exceeds maximum length of ${MAX_QUERY_LENGTH} characters`,
      );
    }
    return handleUberSearch(
      {
        query,
        engines: parseOptionalCommaList("engines", args.engines),
        categories: parseOptionalCommaList("categories", args.categories),
        limit: parseLimit(args.limit),
        strategy: parseStrategy(args.strategy),
      },
      container,
    );
  },
};

const uberSearchCreditsTool: ToolDefinition = {
  name: "uber_search_credits",
  description: "Show credit status for all configured search engines",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  handler: async (_args, container) => handleCredits(container),
};

const uberSearchHealthTool: ToolDefinition = {
  name: "uber_search_health",
  description: "Run health checks on all configured search providers",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  handler: async (_args, container) => handleHealth(container),
};

export const tools: readonly ToolDefinition[] = [
  uberSearchTool,
  uberSearchCreditsTool,
  uberSearchHealthTool,
];

export function findTool(name: string): ToolDefinition | undefined {
  return tools.find((tool) => tool.name === name);
}
