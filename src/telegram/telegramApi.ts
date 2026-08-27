import { request } from "node:https";
import { URL } from "node:url";
import { Api } from "node-telegram-bot-api";
import type { Message, ChatId, Update, User } from "node-telegram-bot-api";

export type { Update, User, Message, ChatId };

function createIPv4Fetch(): typeof fetch {
  return (input, init) =>
    new Promise((resolve, reject) => {
      const url = new URL(input as string);
      const body = init?.body;
      const payload =
        typeof body === "string"
          ? body
          : body instanceof URLSearchParams
            ? body.toString()
            : body !== undefined && body !== null
              ? JSON.stringify(body)
              : undefined;

      const req = request(
        {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + url.search,
          method: init?.method || "GET",
          headers: init?.headers as Record<string, string> | undefined,
          family: 4,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const bodyBuffer = Buffer.concat(chunks);
            const headers = Object.entries(res.headers).flatMap(([key, value]) => {
              if (value === undefined) return [];
              return Array.isArray(value)
                ? value.map((v) => [key, v] as [string, string])
                : ([[key, value]] as [string, string][]);
            });

            resolve(
              new Response(bodyBuffer, {
                status: res.statusCode ?? 200,
                statusText: res.statusMessage ?? "OK",
                headers,
              }),
            );
          });
        },
      );

      req.on("error", reject);

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
}

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
