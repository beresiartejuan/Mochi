import { Api, type Message, type ChatId, type Update, type User } from "node-telegram-bot-api";
import { createIPv4Fetch } from "../utils/createIPv4Fetch.js";

export type { Update, User, Message, ChatId };

export function createTelegramApi(token: string): Api {
  return new Api(token, { fetch: createIPv4Fetch() });
}

export function extractMessageFromUpdate(update: Update): Message | undefined {
  if ("message" in update && update.message) return update.message;
  if ("edited_message" in update && update.edited_message) return update.edited_message;
  return undefined;
}

export async function sendTelegramMessage(api: Api, chatId: ChatId, text: string): Promise<Message> {
  const trimmedText = text.trim();
  if (!trimmedText) {
    throw new Error(`[sendTelegramMessage] texto vacío para chat_id=${chatId}`);
  }

  const response = await api.sendMessage({ chat_id: chatId, text: trimmedText });

  if (!response || typeof response.message_id !== "number") {
    throw new Error(`[sendTelegramMessage] respuesta inesperada: ${JSON.stringify(response)}`);
  }

  return response;
}

export async function verifyTelegramToken(token: string): Promise<{ ok: true; username: string | undefined }> {
  const api = createTelegramApi(token);
  const me: User = await api.getMe();

  if (!me) {
    throw new Error("Could not verify Telegram token: getMe returned no data");
  }

  return { ok: true, username: me.username };
}
