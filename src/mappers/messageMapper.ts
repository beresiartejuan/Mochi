import type { Message } from "node-telegram-bot-api";
import { computeMessageScore, type ChatMessageInput } from "../store/messageStore.js";

export function telegramMessageToChatMessageInput(
  message: Message,
  author: "user" | "assistant",
): ChatMessageInput {
  const content = message.text ?? "";

  return {
    author,
    content,
    date: new Date(message.date * 1000),
    telegramMessageId: message.message_id,
    score: computeMessageScore(content),
    isInSummary: false,
  };
}
