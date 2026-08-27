const THIRTY_SECONDS_MS = 30_000;

export function isOlderThanOneMinute(date: Date, now: Date = new Date()): boolean {
  return now.getTime() - date.getTime() > THIRTY_SECONDS_MS;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
