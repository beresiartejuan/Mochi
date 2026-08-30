import type { Api, ChatId } from "node-telegram-bot-api";
import { getCurrentDateTime } from "./dateTools.js";
import { searchWikipedia } from "./wikipediaTool.js";
import { createWebSearchTool } from "./webSearchTool.js";
import { createTelegramSendMessageTool } from "./telegramTool.js";
import { createExecuteCommandTool } from "./executeCommandTool.js";
import { createExecuteCodeTool } from "./executeCodeTool.js";
import { createMemoryTools } from "./memoryTools.js";
import { createReminderTools } from "./reminderTools.js";
import type { MemoryStore } from "../../store/memoryStore.js";
import type { ReminderStore } from "../../store/reminderStore.js";

export type AgentTools = ReturnType<typeof createAgentTools>;

export function createAgentTools(config: {
  telegramApi: Api;
  chatId: ChatId;
  workspaceDir: string;
  memoryStore: MemoryStore;
  reminderStore: ReminderStore;
  serpApiKey?: string | undefined;
  tavilyApiKey?: string | undefined;
}) {
  const memoryTools = createMemoryTools(config.memoryStore);
  const reminderTools = createReminderTools(config.reminderStore);

  return {
    getCurrentDateTime,
    searchWikipedia,
    webSearch: createWebSearchTool(config),
    sendTelegramMessage: createTelegramSendMessageTool(config.telegramApi, config.chatId),
    executeCommand: createExecuteCommandTool({ workspaceDir: config.workspaceDir }),
    executeCode: createExecuteCodeTool(),
    remember: memoryTools.remember,
    recall: memoryTools.recall,
    forget: memoryTools.forget,
    setReminder: reminderTools.setReminder,
    listReminders: reminderTools.listReminders,
    deleteReminder: reminderTools.deleteReminder,
  };
}
