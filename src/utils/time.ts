const ONE_MINUTE_MS = 60_000;

export function isOlderThanOneMinute(date: Date, now: Date = new Date()): boolean {
  return now.getTime() - date.getTime() > ONE_MINUTE_MS;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
