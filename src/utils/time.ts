const REPLY_THRESHOLD_MS = 30_000;

export function isOlderThanReplyThreshold(date: Date, now: Date = new Date()): boolean {
  return now.getTime() - date.getTime() > REPLY_THRESHOLD_MS;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
