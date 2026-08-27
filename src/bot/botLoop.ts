import type { Api } from "node-telegram-bot-api";
import type { Ollama } from "ollama";
import { chatWithOllama } from "../config/ollama.js";
import { loadEnv, type Env } from "../config/env.js";
import { createOllamaAgent } from "../config/ollama.js";
import { MessageStore, sumScores, type ChatMessage } from "../store/messageStore.js";
import { createTelegramApi, sendTelegramMessage, extractMessageFromUpdate } from "../telegram/telegramApi.js";
import { TelegramLongPoller } from "../telegram/polling.js";
import { isOlderThanOneMinute, sleep } from "../utils/time.js";
import { telegramMessageToChatMessageInput } from "../mappers/messageMapper.js";
import {
  recalculateSummaryIfNeeded,
  formatMessagesForPrompt,
  SUMMARY_BATCH_THRESHOLD,
  SUMMARY_THRESHOLD_TOTAL,
} from "../summary/summaryService.js";

export type BotDependencies = {
  config: Env;
  telegramApi: Api;
  ollamaAgent: Ollama;
  store: MessageStore;
  poller: TelegramLongPoller;
};

export function createBotDependencies(): BotDependencies {
  const env = loadEnv();

  return {
    config: env,
    telegramApi: createTelegramApi(env.TELEGRAM_BOT_TOKEN),
    ollamaAgent: createOllamaAgent(env),
    store: new MessageStore(),
    poller: new TelegramLongPoller({
      token: env.TELEGRAM_BOT_TOKEN,
      timeout: env.POLLING_TIMEOUT,
      retrySeconds: env.POLLING_RETRY_SECONDS,
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
  const { store, ollamaAgent, config } = deps;
  const messagesNotInSummary = store.getMessagesNotInSummary();
  const totalScore = sumScores(messagesNotInSummary);

  if (totalScore <= SUMMARY_THRESHOLD_TOTAL) {
    return false;
  }

  const result = await recalculateSummaryIfNeeded({
    messagesNotInSummary,
    currentSummary: store.getSummary(),
    model: config.CHAT_MODEL,
    agent: ollamaAgent,
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
  const { store, telegramApi, ollamaAgent, config } = deps;

  const lastMessage = store.getLast();
  if (!lastMessage || lastMessage.author !== "user" || !isOlderThanOneMinute(lastMessage.date)) {
    return;
  }

  const pendingUserMessages = store.takeLastUnansweredFromUser();
  if (pendingUserMessages.length === 0) return;

  const messagesNotInSummary = store.getMessagesNotInSummary();
  const ollamaMessages = formatMessagesForPrompt(messagesNotInSummary, pendingUserMessages);

  const replyText = await chatWithOllama(
    ollamaAgent,
    config.CHAT_MODEL,
    store.getSummary(),
    ollamaMessages,
  );

  const sentMessage = await sendTelegramMessage(telegramApi, config.CHAT_ID.toString(), replyText);

  store.add(telegramMessageToChatMessageInput(sentMessage, "assistant"));
}

export async function runBotLoop(deps: BotDependencies): Promise<void> {
  const { config } = deps;

  console.log("Bot starting...", {
    CHAT_MODEL: config.CHAT_MODEL,
    CHAT_ID: config.CHAT_ID.toString(),
  });

  while (true) {
    try {
      await fetchAndStoreUpdates(deps);

      const summaryRecalculated = await maybeRecalculateSummary(deps);
      if (summaryRecalculated) continue;

      await maybeReply(deps);
    } catch (error) {
      console.error("Main loop error:", error instanceof Error ? error.message : error);
    }

    await sleep(10_000);
  }
}
