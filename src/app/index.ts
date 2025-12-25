// Public API surface for consumers importing the library (non-CLI).

export { bootstrapContainer } from "../bootstrap/container";
// Config helpers
export {
  createConfig,
  defineBrave,
  defineConfig,
  defineEngine,
  defineLinkup,
  definePlugin,
  defineSearchxng,
  defineTavily,
} from "../config/defineConfig";
export type {
  BraveConfig,
  EngineConfig,
  LinkupConfig,
  AiSearchConfig,
  SearchxngConfig,
  TavilyConfig,
} from "../config/types";
export type { EngineId, SearchQuery, SearchResponse, SearchResultItem } from "../core/types";
// Types
export type { AiSearchInput, AiSearchOutput, AiSearchOutputItem } from "../tool/interface";
export type {
  GetCreditStatusOptions,
  AiSearchOptions as ToolAiSearchOptions,
} from "../tool/multiSearchTool";
export { getCreditStatus, multiSearch } from "../tool/multiSearchTool";
