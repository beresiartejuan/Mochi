import type { Api } from "node-telegram-bot-api";
import { loadEnv, type Env } from "../config/env.js";
import { createAiSdkOllamaProvider } from "../config/aiSdk.js";
import { MessageStore, sumScores } from "../store/messageStore.js";
import { createTelegramApi, sendTelegramMessage, extractMessageFromUpdate } from "../telegram/telegramApi.js";
import { TelegramLongPoller } from "../telegram/polling.js";
import { isOlderThanReplyThreshold } from "../utils/time.js";
import { formatError } from "../utils/error.js";
import { telegramMessageToChatMessageInput } from "../mappers/messageMapper.js";
import { loadLastUpdateId, saveLastUpdateId } from "../store/offsetStore.js";
import { openMemoryDb } from "../store/memoryDb.js";
import { MemoryStore } from "../store/memoryStore.js";
import { ReminderStore } from "../store/reminderStore.js";
import { EmbeddingService } from "../config/embeddingService.js";
import {
  recalculateSummaryIfNeeded,
  formatMessagesForPrompt,
  SUMMARY_BATCH_THRESHOLD,
  SUMMARY_THRESHOLD_TOTAL,
} from "../summary/summaryService.js";
import { runPersonalAgent } from "../agents/personalAgent.js";
import { createAgentTools, type AgentTools } from "../agents/tools/index.js";

import type { LanguageModel } from "ai";

export type BotDependencies = {
  config: Env;
  telegramApi: Api;
  aiSdkModel: LanguageModel;
  summaryModel: LanguageModel;
  store: MessageStore;
  memoryStore: MemoryStore;
  reminderStore: ReminderStore;
  poller: TelegramLongPoller;
  tools: AgentTools;
};

export async function createBotDependencies(): Promise<BotDependencies> {
  const env = loadEnv();
  const provider = createAiSdkOllamaProvider(env);
  const telegramApi = createTelegramApi(env.TELEGRAM_BOT_TOKEN);
  const initialUpdateId = await loadLastUpdateId();
  const memoryDb = await openMemoryDb(env.MEMORY_DB_PATH);
  const embeddingService = new EmbeddingService();
  const memoryStore = new MemoryStore(memoryDb, embeddingService);
  const reminderStore = new ReminderStore(memoryDb);
  await runMemoryMaintenance(memoryStore);

  return {
    config: env,
    telegramApi,
    aiSdkModel: provider(env.CHAT_MODEL),
    summaryModel: provider(env.SUMMARY_MODEL ?? env.CHAT_MODEL),
    store: new MessageStore(),
    memoryStore,
    reminderStore,
    poller: new TelegramLongPoller({
      token: env.TELEGRAM_BOT_TOKEN,
      timeout: env.POLLING_TIMEOUT,
      initialUpdateId,
      onUpdateIdChange: saveLastUpdateId,
    }),
    tools: createAgentTools({
      telegramApi,
      chatId: env.CHAT_ID.toString(),
      workspaceDir: env.WORKSPACE_DIR,
      memoryStore,
      reminderStore,
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
  const { store, summaryModel, memoryStore } = deps;
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
    await persistSummary(memoryStore, result.newSummary);
    return true;
  }

  return false;
}

export async function maybeReply(deps: BotDependencies): Promise<void> {
  const { store, telegramApi, config, aiSdkModel } = deps;

  const lastMessage = store.getLast();
  if (!lastMessage || lastMessage.author !== "user" || !isOlderThanReplyThreshold(lastMessage.date)) {
    return;
  }

  const pendingUserMessages = store.takePendingUserMessages();
  if (pendingUserMessages.length === 0) return;

  const proactiveMemories = await recallProactiveMemories(deps.memoryStore, pendingUserMessages);
  const messagesNotInSummary = store.getMessagesNotInSummary();
  const ollamaMessages = formatMessagesForPrompt(messagesNotInSummary, pendingUserMessages);

  const agentResult = await runPersonalAgent({
    model: aiSdkModel,
    summary: store.getSummary(),
    memories: proactiveMemories,
    messages: ollamaMessages,
    tools: deps.tools,
    telegramApi,
    chatId: config.CHAT_ID.toString(),
  });

  if (agentResult.type === "tool_sent") {
    for (const toolResult of agentResult.messages) {
      const sentMessage = toolResult.message;
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

async function runMemoryMaintenance(memoryStore: MemoryStore): Promise<void> {
  try {
    const purged = await memoryStore.purgeExpired();
    const missing = await memoryStore.countMissingEmbeddings();

    if (missing > 0) {
      console.log(`[memory] backfill de embeddings para ${missing} memorias...`);
      const backfilled = await memoryStore.backfillEmbeddings();
      console.log(`[memory] backfill completado: ${backfilled}/${missing}`);
    }

    if (purged > 0) console.log(`[memory] purgadas ${purged} memorias expiradas`);
  } catch (error) {
    console.warn("[memory] mantenimiento falló:", formatError(error));
  }
}

async function loadPersistedSummary(store: MessageStore, memoryStore: MemoryStore): Promise<void> {
  const summary = await memoryStore.getState("summary");
  if (summary) store.setSummary(summary);
}

async function persistSummary(memoryStore: MemoryStore, summary: string): Promise<void> {
  await memoryStore.setState("summary", summary);
}

async function recallProactiveMemories(
  memoryStore: MemoryStore,
  pendingUserMessages: Array<{ content: string }>,
): Promise<string[]> {
  try {
    const query = pendingUserMessages
      .map((message) => message.content)
      .join(" ")
      .slice(0, 500);

    if (!query.trim()) return [];

    const memories = await memoryStore.search(query, 5);
    return memories.map((memory) => memory.content);
  } catch (error) {
    console.warn("[recallProactive] no se pudo recuperar memorias:", formatError(error));
    return [];
  }
}

async function deliverDueReminders(deps: BotDependencies): Promise<void> {
  const { reminderStore, telegramApi, config } = deps;

  const due = await reminderStore.getDue();
  if (due.length === 0) return;

  const now = new Date();

  for (const reminder of due) {
    const text = `⏰ Recordatorio: ${reminder.content}`;
    try {
      await sendTelegramMessage(telegramApi, config.CHAT_ID.toString(), text);
      await reminderStore.markFired(reminder.id, now);

      if (reminder.recurrence) {
        await reminderStore.advanceRecurrence(reminder.id, reminder.dueAt, reminder.recurrence);
      } else {
        await reminderStore.deactivate(reminder.id);
      }
    } catch (error) {
      console.error("[deliverDueReminders] error enviando recordatorio:", formatError(error));
    }
  }
}

export async function runBotLoop(deps: BotDependencies): Promise<void> {
  const { config } = deps;

  await loadPersistedSummary(deps.store, deps.memoryStore);

  console.log("Bot starting...", {
    CHAT_MODEL: config.CHAT_MODEL,
    SUMMARY_MODEL: config.SUMMARY_MODEL ?? config.CHAT_MODEL,
    CHAT_ID: config.CHAT_ID.toString(),
    MEMORY_DB_PATH: config.MEMORY_DB_PATH,
  });

  while (true) {
    try {
      await fetchAndStoreUpdates(deps);

      const summaryRecalculated = await maybeRecalculateSummary(deps);
      if (summaryRecalculated) continue;

      await deliverDueReminders(deps);
      await maybeReply(deps);
    } catch (error) {
      console.error("[main-loop] error:", formatError(error));
    }
  }
}
