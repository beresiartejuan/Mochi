import type { Api, ChatId } from "node-telegram-bot-api";
import { getCurrentDateTime, getDateComponents } from "./dateTools.js";
import { searchWikipedia } from "./wikipediaTool.js";
import { createWebSearchTool } from "./webSearchTool.js";
import { createTelegramSendMessageTool } from "./telegramTool.js";

export type AgentTools = ReturnType<typeof createAgentTools>;

export function createAgentTools(config: {
  telegramApi: Api;
  chatId: ChatId;
  serpApiKey?: string | undefined;
  tavilyApiKey?: string | undefined;
}) {
  return {
    getCurrentDateTime,
    getDateComponents,
    searchWikipedia,
    webSearch: createWebSearchTool(config),
    sendTelegramMessage: createTelegramSendMessageTool(config.telegramApi, config.chatId),
  };
}
