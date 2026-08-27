import { Api, type Update } from "node-telegram-bot-api";
import { createTelegramApi } from "./telegramApi.js";

export type PollingConfig = {
  token: string;
  timeout: number;
  initialUpdateId?: number;
  onUpdateIdChange?: (updateId: number) => void | Promise<void>;
};

export class TelegramLongPoller {
  private readonly api: Api;
  private readonly timeout: number;
  private readonly onUpdateIdChange?: (updateId: number) => void | Promise<void>;
  private lastUpdateId: number;

  constructor(config: PollingConfig) {
    this.api = createTelegramApi(config.token);
    this.timeout = config.timeout;
    this.onUpdateIdChange = config.onUpdateIdChange;
    this.lastUpdateId = config.initialUpdateId ?? 0;
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

  private async persistUpdateId(updateId: number): Promise<void> {
    try {
      await this.onUpdateIdChange?.(updateId);
    } catch (error) {
      console.warn("[poller] no se pudo persistir el update_id:", error);
    }
  }
}
