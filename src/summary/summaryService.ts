import type { Ollama } from "ollama";
import type { ChatMessage, MessageAuthor } from "../store/messageStore.js";
import { chatWithOllamaRaw } from "../config/ollama.js";

export const SUMMARY_THRESHOLD_TOTAL = 25;
export const SUMMARY_BATCH_THRESHOLD = 13;

export type SummaryResult =
  | { type: "recalculated"; newSummary: string; summarizedMessageIds: string[] }
  | { type: "not_needed"; messagesNotInSummary: ChatMessage[] };

type RecalculateSummaryOptions = {
  messagesNotInSummary: ChatMessage[];
  currentSummary: string;
  model: string;
  agent: Ollama;
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

export function messagesToSummaryText(messages: ChatMessage[]): string {
  return messages
    .map((message) => `[${message.author === "user" ? "Usuario" : "Asistente"}] ${message.content}`)
    .join("\n");
}

export function buildSummaryPrompt(currentSummary: string, messages: ChatMessage[]): string {
  const conversation = messagesToSummaryText(messages);

  return currentSummary.trim().length > 0
    ? `Tienes este resumen previo de la conversación:\n\n${currentSummary}\n\nAhora fusionalo con la siguiente conversación y generá un único resumen claro, conciso y útil:\n\n${conversation}\n\nDevolvé solo el resumen fusionado, sin comentarios extras.`
    : `Generá un resumen claro, conciso y útil de la siguiente conversación entre un usuario y un asistente:\n\n${conversation}\n\nDevolvé solo el resumen, sin comentarios extras.`;
}

export async function generateFusedSummary(
  agent: Ollama,
  model: string,
  currentSummary: string,
  messages: ChatMessage[],
): Promise<string> {
  const prompt = buildSummaryPrompt(currentSummary, messages);

  return chatWithOllamaRaw(agent, model, [
    { role: "system", content: "Sos un resumidor experto. Resumís conversaciones manteniendo solo lo relevante: temas tratados, decisiones, datos clave y contexto necesario." },
    { role: "user", content: prompt },
  ]);
}

export async function recalculateSummaryIfNeeded(
  options: RecalculateSummaryOptions,
): Promise<SummaryResult> {
  const { messagesNotInSummary, currentSummary, model, agent, totalThreshold, batchThreshold } = options;

  const totalScore = messagesNotInSummary.reduce((sum: number, message) => sum + message.score, 0);

  if (totalScore <= totalThreshold) {
    return { type: "not_needed", messagesNotInSummary };
  }

  const batch = groupMessagesForSummary(messagesNotInSummary, batchThreshold);

  if (batch.length === 0) {
    return { type: "not_needed", messagesNotInSummary };
  }

  const newSummary = await generateFusedSummary(agent, model, currentSummary, batch);

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
