import type { ChatMessage } from "../store/messageStore.js";
import {
  MAX_SUMMARY_LINES,
  MAX_SUMMARY_WORDS,
  buildSummaryCompactInstructions,
  buildSummaryUserPrompt,
} from "../config/prompts.js";

export function messagesToSummaryText(messages: ChatMessage[]): string {
  return messages
    .map((message) => `[${message.author === "user" ? "Usuario" : "Asistente"}] ${message.content}`)
    .join("\n");
}

export function buildSummaryPrompt(currentSummary: string, messages: ChatMessage[]): string {
  const conversation = messagesToSummaryText(messages);
  const compactInstructions = buildSummaryCompactInstructions(MAX_SUMMARY_LINES, MAX_SUMMARY_WORDS);

  return buildSummaryUserPrompt(currentSummary, conversation, compactInstructions);
}
