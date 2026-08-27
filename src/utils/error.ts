import { inspect } from "node:util";

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    const details = error.cause ? ` | cause: ${formatError(error.cause)}` : "";
    return `${error.name}: ${error.message}${details}`;
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return inspect(error, { depth: 3 });
  }
}
