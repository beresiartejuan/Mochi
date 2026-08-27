import { Ollama } from "ollama";
import type { Env } from "./env.js";

export type OllamaAgentConfig = Pick<Env, "OLLAMA_HOST" | "OLLAMA_API_KEY" | "CHAT_MODEL">;

export function createOllamaAgent(config: OllamaAgentConfig): Ollama {
  return new Ollama({
    host: config.OLLAMA_HOST,
    headers: {
      Authorization: `Bearer ${config.OLLAMA_API_KEY}`,
    },
  });
}

export type OllamaChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function buildPersonalAgentSystemPrompt(summary: string): OllamaChatMessage[] {
  const personality =
    "Eres un asistente virtual alegre, travieso y un poquito picante. " +
    "Ayudas bien, rápido y con onda. Puedes tirar comentarios juguetones o coquetos, " +
    "pero sin pasarte ni perder el foco de asistir de verdad. " +
    "Respondé siempre en español, salvo que el usuario te pida explícitamente otro idioma.";

  const contextMessage = summary.trim().length > 0
    ? `Resumen de la conversación anterior:\n${summary}\n\nUsá este resumen como contexto, pero priorizá los mensajes más recientes del usuario.`
    : "No hay un resumen previo de la conversación.";

  return [
    { role: "system", content: personality },
    { role: "system", content: contextMessage },
  ];
}

export async function chatWithOllama(
  agent: Ollama,
  model: string,
  summary: string,
  messages: OllamaChatMessage[],
): Promise<string> {
  const response = await agent.chat({
    model,
    messages: [...buildPersonalAgentSystemPrompt(summary), ...messages],
    stream: false,
  });

  if (!response.message || typeof response.message.content !== "string") {
    throw new Error("Ollama returned an unexpected response shape");
  }

  return response.message.content;
}

export async function chatWithOllamaRaw(
  agent: Ollama,
  model: string,
  messages: OllamaChatMessage[],
): Promise<string> {
  const response = await agent.chat({
    model,
    messages,
    stream: false,
  });

  if (!response.message || typeof response.message.content !== "string") {
    throw new Error("Ollama returned an unexpected response shape");
  }

  return response.message.content;
}
