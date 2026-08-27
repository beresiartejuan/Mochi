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
  messages: Array<{ role: MessageAuthor; content: string }>;
  tools: Record<string, Tool>;
  telegramApi: Api;
  chatId: ChatId;
};

export type AgentResult =
  | { type: "text"; text: string }
  | { type: "tool_sent"; messages: TelegramMessageToolResult[] };

function buildSystemMessages(summary: string) {
  return [
    { role: "system", content: PERSONALITY_SYSTEM_PROMPT },
    { role: "system", content: TOOL_INSTRUCTIONS_SYSTEM_PROMPT },
    { role: "system", content: buildContextSystemPrompt(summary) },
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
    stopWhen: isStepCount(5),
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
