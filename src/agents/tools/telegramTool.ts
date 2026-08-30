import { tool } from "ai";
import { z } from "zod";
import type { Api, ChatId, Message } from "node-telegram-bot-api";
import { sendTelegramMessage } from "../../telegram/telegramApi.js";

export type TelegramMessageToolResult = {
  ok: true;
  messageId: number;
  text: string;
  message: Message;
};

export function createTelegramSendMessageTool(api: Api, chatId: ChatId) {
  return tool({
    description:
      "Envía un mensaje al chat autorizado de Telegram. Usalo siempre que quieras responder al usuario en lugar de devolver texto libre. " +
      "Podés invocar esta tool varias veces en la misma corrida para enviar la respuesta en tandas de mensajes cortos.",
    inputSchema: z.object({
      text: z.string().describe("Texto a enviar al chat de Telegram."),
    }),
    execute: async ({ text }): Promise<TelegramMessageToolResult> => {
      const sentMessage = await sendTelegramMessage(api, chatId, text);
      return {
        ok: true,
        messageId: sentMessage.message_id,
        text,
        message: sentMessage,
      };
    },
    toModelOutput: () => ({
      type: "content" as const,
      value: [{ type: "text" as const, text: "Mensaje enviado." }],
    }),
  });
}