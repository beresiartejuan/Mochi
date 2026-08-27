import { generateText, tool, type Tool } from "ai";
import { z } from "zod";
import type { MessageAuthor } from "../store/messageStore.js";

import type { LanguageModel } from "ai";

export type AgentConfig = {
  model: LanguageModel;
  summary: string;
  messages: Array<{ role: MessageAuthor; content: string }>;
  tools?: Record<string, Tool>;
};

function buildSystemMessages(summary: string) {
  const personality =
    "Eres un asistente virtual alegre, travieso y un poquito picante. " +
    "Ayudas bien, rápido y con onda. Puedes tirar comentarios juguetones o coquetos, " +
    "pero sin pasarte ni perder el foco de asistir de verdad. " +
    "Respondé siempre en español, salvo que el usuario te pida explícitamente otro idioma.";

  const contextMessage =
    summary.trim().length > 0
      ? `Resumen de la conversación anterior:\n${summary}\n\nUsá este resumen como contexto, pero priorizá los mensajes más recientes del usuario.`
      : "No hay un resumen previo de la conversación.";

  return [
    { role: "system", content: personality },
    { role: "system", content: contextMessage },
  ] as const;
}

export async function runPersonalAgent(config: AgentConfig): Promise<string> {
  const { model, summary, messages, tools } = config;

  const result = tools
    ? await generateText({
        model,
        system: buildSystemMessages(summary)
          .map((message) => message.content)
          .join("\n\n"),
        messages,
        tools,
      })
    : await generateText({
        model,
        system: buildSystemMessages(summary)
          .map((message) => message.content)
          .join("\n\n"),
        messages,
      });

  return result.text;
}

export const defaultPersonalTools = {
  getCurrentDate: tool({
    description: "Obtiene la fecha y hora actual del sistema.",
    inputSchema: z.object({}),
    execute: async () => {
      return new Date().toISOString();
    },
  }),
};
