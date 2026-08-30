import { z } from "zod";

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  OLLAMA_API_KEY: z.string().min(1, "OLLAMA_API_KEY is required"),
  OLLAMA_HOST: z.string().url().default("https://ollama.com"),
  CHAT_ID: z.coerce.bigint().refine((v) => v > 0n, "CHAT_ID must be a positive integer"),
  CHAT_MODEL: z.string().min(1, "CHAT_MODEL is required"),
  SUMMARY_MODEL: z.string().min(1).optional(),
  SERP_API_KEY: z.string().min(1).optional(),
  TAVILY_API_KEY: z.string().min(1).optional(),
  POLLING_TIMEOUT: z.coerce.number().int().min(1).max(600).default(60),
  POLLING_RETRY_SECONDS: z.coerce.number().int().min(1).default(6),
  WORKSPACE_DIR: z.string().min(1, "WORKSPACE_DIR is required"),
  MEMORY_DB_PATH: z.string().min(1).default("data/memory.db"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(`Environment validation failed:\n${issues}`);
  }

  return parsed.data;
}
