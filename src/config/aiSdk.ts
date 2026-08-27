import { createOllama } from "ollama-ai-provider-v2";
import type { Env } from "./env.js";

export type AiSdkConfig = Pick<Env, "OLLAMA_HOST" | "OLLAMA_API_KEY">;

export function createAiSdkOllamaProvider(config: AiSdkConfig) {
  return createOllama({
    baseURL: config.OLLAMA_HOST,
    headers: {
      Authorization: `Bearer ${config.OLLAMA_API_KEY}`,
    },
  });
}
