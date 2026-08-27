import { Api } from "node-telegram-bot-api";
import type { Update } from "node-telegram-bot-api";
import { createTelegramApi } from "./telegramApi.js";

export type { Update };

export type PollingConfig = {
  token: string;
  timeout: number;
  retrySeconds: number;
  initialUpdateId?: number;
  onUpdateIdChange?: (updateId: number) => void | Promise<void>;
};

export type UpdateHandler = (update: Update) => void | Promise<void>;

export class TelegramLongPoller {
  private readonly api: Api;
  private readonly timeout: number;
  private readonly retrySeconds: number;
  private readonly onUpdateIdChange?: (updateId: number) => void | Promise<void>;
  private lastUpdateId: number;
  private running = false;

  constructor(config: PollingConfig) {
    this.api = createTelegramApi(config.token);
    this.timeout = config.timeout;
    this.retrySeconds = config.retrySeconds;
    this.onUpdateIdChange = config.onUpdateIdChange;
    this.lastUpdateId = config.initialUpdateId ?? 0;
  }

  async start(onUpdate: UpdateHandler): Promise<void> {
    this.running = true;

    while (this.running) {
      try {
        const updates = await this.fetchUpdates();

        for (const update of updates) {
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

    if (response.length > 0) {
      const maxUpdateId = response[response.length - 1]!.update_id;
      this.lastUpdateId = maxUpdateId;
      await this.persistUpdateId(maxUpdateId);
    }

    return response;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async persistUpdateId(updateId: number): Promise<void> {
    try {
      await this.onUpdateIdChange?.(updateId);
    } catch (error) {
      console.warn("[poller] no se pudo persistir el update_id:", error);
    }
  }
}
