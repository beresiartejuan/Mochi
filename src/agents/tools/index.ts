import { getCurrentDateTime, getDateComponents } from "./dateTools.js";
import { searchWikipedia } from "./wikipediaTool.js";
import { createWebSearchTool } from "./webSearchTool.js";

export function createAgentTools(config: { serpApiKey?: string | undefined; tavilyApiKey?: string | undefined }) {
  return {
    getCurrentDateTime,
    getDateComponents,
    searchWikipedia,
    webSearch: createWebSearchTool(config),
  };
}
