import { Api } from "node-telegram-bot-api";
import type { Update } from "node-telegram-bot-api";
import { createTelegramApi } from "./telegramApi.js";

export type { Update };

export type PollingConfig = {
  token: string;
  timeout: number;
  retrySeconds: number;
};

export type UpdateHandler = (update: Update) => void | Promise<void>;

export class TelegramLongPoller {
  private readonly api: Api;
  private readonly timeout: number;
  private readonly retrySeconds: number;
  private lastUpdateId = 0;
  private running = false;

  constructor(config: PollingConfig) {
    this.api = createTelegramApi(config.token);
    this.timeout = config.timeout;
    this.retrySeconds = config.retrySeconds;
  }

  async start(onUpdate: UpdateHandler): Promise<void> {
    this.running = true;

    while (this.running) {
      try {
        const updates = await this.fetchUpdates();

        for (const update of updates) {
          this.lastUpdateId = update.update_id;
          await onUpdate(update);
        }
      } catch (error) {
        console.error("Polling error:", error instanceof Error ? error.message : error);
        await this.sleep(this.retrySeconds * 1000);
      }
    }
  }

  stop(): void {
    this.running = false;
  }

  async fetchUpdates(): Promise<Update[]> {
    const response = await this.api.getUpdates({
      offset: this.lastUpdateId + 1,
      limit: 100,
      timeout: this.timeout,
      allowed_updates: ["message"],
    });

    if (!Array.isArray(response)) {
      throw new Error(`Unexpected Telegram response: ${JSON.stringify(response)}`);
    }

    return response;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
