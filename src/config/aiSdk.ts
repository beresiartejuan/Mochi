import { createOllama } from "ollama-ai-provider-v2";
import type { Env } from "./env.js";

export type AiSdkConfig = Pick<Env, "OLLAMA_HOST" | "OLLAMA_API_KEY">;

function toApiBaseURL(host: string): string {
  const trimmed = host.replace(/\/$/, "");
  if (trimmed === "https://ollama.com") return "https://api.ollama.com/api";
  return trimmed;
}

export function createAiSdkOllamaProvider(config: AiSdkConfig) {
  return createOllama({
    baseURL: toApiBaseURL(config.OLLAMA_HOST),
    headers: {
      Authorization: `Bearer ${config.OLLAMA_API_KEY}`,
    },
  });
}
