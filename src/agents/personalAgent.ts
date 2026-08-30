import { generateText, isStepCount, type Tool, type LanguageModel } from "ai";
import type { Api, ChatId } from "node-telegram-bot-api";
import type { MessageAuthor } from "../store/messageStore.js";
import {
  PERSONALITY_SYSTEM_PROMPT,
  TOOL_INSTRUCTIONS_SYSTEM_PROMPT,
  buildContextSystemPrompt,
} from "../config/prompts.js";
import type { TelegramMessageToolResult } from "./tools/telegramTool.js";

export type AgentConfig = {
  model: LanguageModel;
  summary: string;
  memories: string[];
  profile?: string;
  messages: Array<{ role: MessageAuthor; content: string }>;
  tools: Record<string, Tool>;
  telegramApi: Api;
  chatId: ChatId;
};

export type AgentResult =
  | { type: "text"; text: string }
  | { type: "tool_sent"; messages: TelegramMessageToolResult[] };

function buildSystemMessages(summary: string, memories: string[], profile?: string) {
  const parts = [
    PERSONALITY_SYSTEM_PROMPT,
    profile && profile.trim().length > 0 ? profile : "",
    TOOL_INSTRUCTIONS_SYSTEM_PROMPT,
    buildContextSystemPrompt(summary),
  ].filter((part) => part.length > 0);

  if (memories.length > 0) {
    parts.push(
      `Datos relevantes de tu memoria persistente para este mensaje:\n${memories.map((m) => `- ${m}`).join("\n")}`,
    );
  }

  return parts.join("\n\n");
}

export async function runPersonalAgent(config: AgentConfig): Promise<AgentResult> {
  const { model, summary, memories, profile, messages, tools } = config;

  const result = await generateText({
    model,
    system: buildSystemMessages(summary, memories, profile),
    messages,
    tools,
    stopWhen: isStepCount(10),
  });

  const sentMessages: TelegramMessageToolResult[] = [];

  for (const toolResult of result.toolResults) {
    if (toolResult.toolName === "sendTelegramMessage") {
      sentMessages.push(toolResult.output as TelegramMessageToolResult);
    }
  }

  if (sentMessages.length > 0) {
    return { type: "tool_sent", messages: sentMessages };
  }

  return { type: "text", text: result.text };
}
