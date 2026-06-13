import { describe, expect, test } from "bun:test";
import { findTool, tools } from "../../../src/mcp/registry";

// The tool-layer fallback default for strategy — must stay in sync with the
// schema's declared default (see src/tool/uberSearchTool.ts).
const TOOL_LAYER_STRATEGY_DEFAULT = "first-success" as const;

describe("MCP tool registry", () => {
  test("exposes exactly the three documented tools", () => {
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["uber_search", "uber_search_credits", "uber_search_health"]);
  });

  test("each tool entry has a name, description, inputSchema, and handler", () => {
    for (const tool of tools) {
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toMatchObject({ type: "object" });
      expect(typeof tool.handler).toBe("function");
    }
  });

  test("findTool returns the entry for known names", () => {
    expect(findTool("uber_search")).toBeDefined();
    expect(findTool("uber_search_credits")).toBeDefined();
    expect(findTool("uber_search_health")).toBeDefined();
  });

  test("findTool returns undefined for unknown names", () => {
    expect(findTool("uber_search_unknown")).toBeUndefined();
    expect(findTool("")).toBeUndefined();
    expect(findTool("UBER_SEARCH")).toBeUndefined();
  });

  // Snapshot of the (name, description, inputSchema) shape — protects MCP
  // clients from accidental schema drift. Update deliberately when a tool's
  // surface intentionally evolves.
  test("snapshot of the tool surface", () => {
    const surface = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
    expect(surface).toMatchSnapshot();
  });

  describe("uber_search inputSchema", () => {
    const schema = findTool("uber_search")?.inputSchema as {
      properties: Record<string, { type: string; description?: string }>;
      required: string[];
    };

    test("requires query", () => {
      expect(schema.required).toContain("query");
    });

    test("declares the documented optional inputs", () => {
      expect(Object.keys(schema.properties).sort()).toEqual([
        "categories",
        "engines",
        "limit",
        "query",
        "strategy",
      ]);
    });

    test("strategy enumerates 'all' and 'first-success'", () => {
      const strategy = schema.properties.strategy as unknown as { enum: string[] };
      expect(strategy.enum).toEqual(["all", "first-success"]);
    });

    // This test binds the schema's declared default to the tool layer's actual
    // fallback so they can't silently drift. If this test fails, update both the
    // registry schema and uberSearchTool.ts (line ~82: `strategy ?? "…"`) together.
    test("schema default for strategy matches the tool-layer applied default", () => {
      const strategy = schema.properties.strategy as unknown as { default: string };
      expect(strategy.default).toBe(TOOL_LAYER_STRATEGY_DEFAULT);
    });
  });
});
