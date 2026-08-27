import type { Api } from "node-telegram-bot-api";
import { loadEnv, type Env } from "../config/env.js";
import { createAiSdkOllamaProvider } from "../config/aiSdk.js";
import { MessageStore, sumScores, type ChatMessage } from "../store/messageStore.js";
import { createTelegramApi, sendTelegramMessage, extractMessageFromUpdate } from "../telegram/telegramApi.js";
import { TelegramLongPoller } from "../telegram/polling.js";
import { isOlderThanOneMinute, sleep } from "../utils/time.js";
import { inspect } from "node:util";
import { telegramMessageToChatMessageInput } from "../mappers/messageMapper.js";
import {
  recalculateSummaryIfNeeded,
  formatMessagesForPrompt,
  SUMMARY_BATCH_THRESHOLD,
  SUMMARY_THRESHOLD_TOTAL,
} from "../summary/summaryService.js";
import { runPersonalAgent } from "../agents/personalAgent.js";
import { createAgentTools } from "../agents/tools/index.js";

import type { LanguageModel } from "ai";

function formatError(error: unknown): string {
  if (error instanceof Error) {
    const details = error.cause ? ` | cause: ${formatError(error.cause)}` : "";
    return `${error.name}: ${error.message}${details}`;
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return inspect(error, { depth: 3 });
  }
}

export type BotDependencies = {
  config: Env;
  telegramApi: Api;
  aiSdkModel: LanguageModel;
  summaryModel: LanguageModel;
  store: MessageStore;
  poller: TelegramLongPoller;
  tools: ReturnType<typeof createAgentTools>;
};

export function createBotDependencies(): BotDependencies {
  const env = loadEnv();
  const provider = createAiSdkOllamaProvider(env);
  const telegramApi = createTelegramApi(env.TELEGRAM_BOT_TOKEN);

  return {
    config: env,
    telegramApi,
    aiSdkModel: provider(env.CHAT_MODEL),
    summaryModel: provider(env.SUMMARY_MODEL ?? env.CHAT_MODEL),
    store: new MessageStore(),
    poller: new TelegramLongPoller({
      token: env.TELEGRAM_BOT_TOKEN,
      timeout: env.POLLING_TIMEOUT,
      retrySeconds: env.POLLING_RETRY_SECONDS,
    }),
    tools: createAgentTools({
      telegramApi,
      chatId: env.CHAT_ID.toString(),
      serpApiKey: env.SERP_API_KEY,
      tavilyApiKey: env.TAVILY_API_KEY,
    }),
  };
}

export async function fetchAndStoreUpdates(deps: BotDependencies): Promise<void> {
  const { poller, store, config } = deps;
  const updates = await poller.fetchUpdates();
  const chatId = config.CHAT_ID.toString();

  for (const update of updates) {
    const message = extractMessageFromUpdate(update);
    if (!message || String(message.chat.id) !== chatId) continue;

    store.add(telegramMessageToChatMessageInput(message, "user"));
  }
}

export async function maybeRecalculateSummary(deps: BotDependencies): Promise<boolean> {
  const { store, summaryModel } = deps;
  const messagesNotInSummary = store.getMessagesNotInSummary();
  const totalScore = sumScores(messagesNotInSummary);

  if (totalScore <= SUMMARY_THRESHOLD_TOTAL) {
    return false;
  }

  const result = await recalculateSummaryIfNeeded({
    messagesNotInSummary,
    currentSummary: store.getSummary(),
    model: summaryModel,
    totalThreshold: SUMMARY_THRESHOLD_TOTAL,
    batchThreshold: SUMMARY_BATCH_THRESHOLD,
  });

  if (result.type === "recalculated") {
    store.setSummary(result.newSummary);
    store.markAsInSummary(result.summarizedMessageIds);
    return true;
  }

  return false;
}

export async function maybeReply(deps: BotDependencies): Promise<void> {
  const { store, telegramApi, config, aiSdkModel } = deps;

  const lastMessage = store.getLast();
  if (!lastMessage || lastMessage.author !== "user" || !isOlderThanOneMinute(lastMessage.date)) {
    return;
  }

  const pendingUserMessages = store.takePendingUserMessages();
  if (pendingUserMessages.length === 0) return;

  const messagesNotInSummary = store.getMessagesNotInSummary();
  const ollamaMessages = formatMessagesForPrompt(messagesNotInSummary, pendingUserMessages);

  const agentResult = await runPersonalAgent({
    model: aiSdkModel,
    summary: store.getSummary(),
    messages: ollamaMessages,
    tools: deps.tools,
    telegramApi,
    chatId: config.CHAT_ID.toString(),
  });

  if (agentResult.type === "tool_sent") {
    for (const sentMessage of agentResult.messages) {
      if (!sentMessage.text) {
        console.warn("[maybeReply] tool envió un mensaje vacío; se ignora");
        continue;
      }
      store.add(telegramMessageToChatMessageInput(sentMessage, "assistant"));
    }
    return;
  }

  if (!agentResult.text.trim()) {
    console.warn("[maybeReply] agente devolvió texto vacío; no se envía respuesta");
    return;
  }

  const sentMessage = await sendTelegramMessage(telegramApi, config.CHAT_ID.toString(), agentResult.text);

  store.add(telegramMessageToChatMessageInput(sentMessage, "assistant"));
}

export async function runBotLoop(deps: BotDependencies): Promise<void> {
  const { config } = deps;

  console.log("Bot starting...", {
    CHAT_MODEL: config.CHAT_MODEL,
    SUMMARY_MODEL: config.SUMMARY_MODEL ?? config.CHAT_MODEL,
    CHAT_ID: config.CHAT_ID.toString(),
  });

  while (true) {
    try {
      await fetchAndStoreUpdates(deps);

      const summaryRecalculated = await maybeRecalculateSummary(deps);
      if (summaryRecalculated) continue;

      await maybeReply(deps);
    } catch (error) {
      console.error("[main-loop] error:", formatError(error));
    }

    await sleep(10_000);
  }
}
