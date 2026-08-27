import { randomUUID } from "node:crypto";

export type MessageAuthor = "user" | "assistant";

export type ChatMessage = {
  id: string;
  author: MessageAuthor;
  content: string;
  date: Date;
  telegramMessageId?: number;
  score: number;
  isInSummary: boolean;
};

export type ChatMessageInput = Omit<ChatMessage, "id" | "score"> & {
  score?: number;
};

export class MessageStore {
  private readonly messages: ChatMessage[] = [];
  private summaryText = "";

  add(input: ChatMessageInput): ChatMessage {
    const message: ChatMessage = {
      ...input,
      id: randomUUID(),
      score: input.score ?? computeMessageScore(input.content),
    };

    const insertIndex = this.findInsertIndex(message.date);
    this.messages.splice(insertIndex, 0, message);

    return message;
  }

  addMany(inputs: ChatMessageInput[]): ChatMessage[] {
    return inputs.map((input) => this.add(input));
  }

  markAsInSummary(ids: string[]): void {
    for (const message of this.messages) {
      if (ids.includes(message.id)) {
        message.isInSummary = true;
      }
    }
  }

  getAll(): readonly ChatMessage[] {
    return this.messages;
  }

  getLast(): ChatMessage | undefined {
    return this.messages.at(-1);
  }

  getSummary(): string {
    return this.summaryText;
  }

  setSummary(summary: string): void {
    this.summaryText = summary;
  }

  getMessagesNotInSummary(): ChatMessage[] {
    return this.messages.filter((message) => !message.isInSummary);
  }

  takeLastUnansweredFromUser(): ChatMessage[] {
    const result: ChatMessage[] = [];

    for (let i = this.messages.length - 1; i >= 0; i--) {
      const message = this.messages[i]!;
      if (message.author === "assistant") break;
      result.unshift(message);
    }

    return result;
  }

  private findInsertIndex(date: Date): number {
    let left = 0;
    let right = this.messages.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (this.messages[mid]!.date.getTime() <= date.getTime()) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    return left;
  }
}

export function computeMessageScore(content: string): number {
  return content.length / 280;
}

export function sumScores(messages: ReadonlyArray<{ score: number }>): number {
  return messages.reduce((total, message) => total + message.score, 0);
}
