import { generateText, type Tool } from "ai";
import type { Api, ChatId, Message } from "node-telegram-bot-api";
import type { LanguageModel } from "ai";
import type { MessageAuthor } from "../store/messageStore.js";

export type AgentConfig = {
  model: LanguageModel;
  summary: string;
  messages: Array<{ role: MessageAuthor; content: string }>;
  tools: Record<string, Tool>;
  telegramApi: Api;
  chatId: ChatId;
};

export type AgentResult =
  | { type: "text"; text: string }
  | { type: "tool_sent"; messages: Message[] };

function buildSystemMessages(summary: string) {
  const personality =
    "Eres un asistente virtual alegre, travieso y un poquito picante. " +
    "Ayudás bien, rápido y con onda. Podés tirar comentarios juguetones o coquetos, " +
    "pero sin pasarte ni perder el foco de asistir de verdad. " +
    "Respondé siempre en español, salvo que el usuario te pida explícitamente otro idioma.";

  const toolInstructions =
    "Para responder al usuario usá la tool `sendTelegramMessage`. " +
    "Podés enviar la respuesta en una sola invocación o en varias tandas si preferís fragmentar el mensaje. " +
    "Si usás tandas, invocá `sendTelegramMessage` una vez por cada fragmento, en orden. " +
    "Cada invocación debe incluir un `text` no vacío; Telegram rechaza mensajes vacíos. " +
    "No devuelvas texto libre salvo en casos de error crítico del agente. " +
    "Si el usuario pide información externa (web, wikipedia, fecha), primero invocá la tool correspondiente, " +
    "analizá el resultado y luego respondé al usuario mediante `sendTelegramMessage`. " +
    "Podés combinar tools de búsqueda con múltiples envíos de Telegram en la misma corrida."

  const contextMessage =
    summary.trim().length > 0
      ? `Resumen de la conversación anterior:\n${summary}\n\nUsá este resumen como contexto, pero priorizá los mensajes más recientes del usuario.`
      : "No hay un resumen previo de la conversación.";

  return [
    { role: "system", content: personality },
    { role: "system", content: toolInstructions },
    { role: "system", content: contextMessage },
  ] as const;
}

export async function runPersonalAgent(config: AgentConfig): Promise<AgentResult> {
  const { model, summary, messages, tools } = config;

  const result = await generateText({
    model,
    system: buildSystemMessages(summary)
      .map((message) => message.content)
      .join("\n\n"),
    messages,
    tools,
  });

  const sentMessages: Message[] = [];

  for (const toolResult of result.toolResults) {
    const typedResult = toolResult as {
      toolName?: string;
      output?: unknown;
    };

    if (
      typedResult.toolName === "sendTelegramMessage" &&
      typeof typedResult.output === "object" &&
      typedResult.output !== null
    ) {
      const output = typedResult.output as { messageId: number; text: string };

      sentMessages.push({
        message_id: output.messageId,
        chat: { id: Number(config.chatId), type: "private" },
        date: Math.floor(Date.now() / 1000),
        text: output.text,
      } as Message);
    }
  }

  if (sentMessages.length > 0) {
    return { type: "tool_sent", messages: sentMessages };
  }

  return { type: "text", text: result.text };
}
