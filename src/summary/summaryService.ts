import { generateText } from "ai";
import type { LanguageModel } from "ai";
import type { ChatMessage, MessageAuthor } from "../store/messageStore.js";
import { buildSummaryPrompt } from "./summaryPrompt.js";

export const SUMMARY_THRESHOLD_TOTAL = 25;
export const SUMMARY_BATCH_THRESHOLD = 13;

export type SummaryResult =
  | { type: "recalculated"; newSummary: string; summarizedMessageIds: string[] }
  | { type: "not_needed"; messagesNotInSummary: ChatMessage[] };

type RecalculateSummaryOptions = {
  messagesNotInSummary: ChatMessage[];
  currentSummary: string;
  model: LanguageModel;
  totalThreshold: number;
  batchThreshold: number;
};

export function groupMessagesForSummary(
  messagesNotInSummary: ChatMessage[],
  assistantBatchThreshold: number,
): ChatMessage[] {
  const batch: ChatMessage[] = [];
  let runningScore = 0;

  for (const message of messagesNotInSummary) {
    if (message.author === "assistant") {
      if (runningScore + message.score > assistantBatchThreshold && runningScore > 0) {
        break;
      }
    }

    batch.push(message);
    runningScore += message.score;
  }

  return batch;
}

export async function generateFusedSummary(
  model: LanguageModel,
  currentSummary: string,
  messages: ChatMessage[],
): Promise<string> {
  const prompt = buildSummaryPrompt(currentSummary, messages);

  const result = await generateText({
    model,
    system:
      "Sos un resumidor experto y compacto. Fusionás conversaciones anteriores con nuevos mensajes y devolvés un resumen denso, útil y breve. Preferís calidad sobre cantidad de texto.",
    prompt,
  });

  return result.text;
}

export async function recalculateSummaryIfNeeded(
  options: RecalculateSummaryOptions,
): Promise<SummaryResult> {
  const { messagesNotInSummary, currentSummary, model, totalThreshold, batchThreshold } = options;

  const totalScore = messagesNotInSummary.reduce((sum: number, message) => sum + message.score, 0);

  if (totalScore <= totalThreshold) {
    return { type: "not_needed", messagesNotInSummary };
  }

  const batch = groupMessagesForSummary(messagesNotInSummary, batchThreshold);

  if (batch.length === 0) {
    return { type: "not_needed", messagesNotInSummary };
  }

  const newSummary = await generateFusedSummary(model, currentSummary, batch);

  return {
    type: "recalculated",
    newSummary,
    summarizedMessageIds: batch.map((message) => message.id),
  };
}

export function formatMessagesForPrompt(
  messages: ChatMessage[],
  pendingUserMessages: ChatMessage[],
): Array<{ role: MessageAuthor; content: string }> {
  const pendingIds = new Set(pendingUserMessages.map((message) => message.id));
  const previousMessages = messages.filter((message) => !pendingIds.has(message.id));

  return [
    ...previousMessages.map((message) => ({ role: message.author, content: message.content })),
    ...pendingUserMessages.map((message) => ({ role: message.author, content: message.content })),
  ];
}
