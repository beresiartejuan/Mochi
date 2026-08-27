import { tool } from "ai";
import { z } from "zod";
import type { Api } from "node-telegram-bot-api";
import type { ChatId } from "node-telegram-bot-api";
import { sendTelegramMessage } from "../../telegram/telegramApi.js";

export function createTelegramSendMessageTool(api: Api, chatId: ChatId) {
  return tool({
    description:
      "Envía un mensaje al chat autorizado de Telegram. Usalo siempre que quieras responder al usuario en lugar de devolver texto libre.",
    inputSchema: z.object({
      text: z.string().describe("Texto a enviar al chat de Telegram."),
    }),
    execute: async ({ text }) => {
      const sentMessage = await sendTelegramMessage(api, chatId, text);
      return {
        ok: true,
        messageId: sentMessage.message_id,
        text,
      };
    },
  });
}
