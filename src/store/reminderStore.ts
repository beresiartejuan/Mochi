import { randomUUID } from "node:crypto";
import type { Database as TursoDatabase } from "@tursodatabase/database";

export type Recurrence = "daily" | "weekly" | "monthly" | "yearly";

export type ReminderRecord = {
  id: string;
  content: string;
  dueAt: Date;
  recurrence: Recurrence | null;
  lastFiredAt: Date | null;
  fireCount: number;
  createdAt: Date;
  active: boolean;
  notifyBeforeMs: number;
  preNotifiedAt: Date | null;
};

export type ReminderInput = {
  content: string;
  dueAt: Date;
  recurrence?: Recurrence | null;
  notifyBeforeMs?: number;
};

export const SUGGESTED_NOTIFY_BEFORE_MS = 1_800_000;

const VALID_RECURRENCES = new Set<Recurrence>(["daily", "weekly", "monthly", "yearly"]);

const REMINDER_COLUMNS =
  "id, content, due_at, recurrence, last_fired_at, fire_count, created_at, active, notify_before_ms, pre_notified_at";

export class ReminderStore {
  private readonly db: TursoDatabase;

  constructor(db: TursoDatabase) {
    this.db = db;
  }

  async add(input: ReminderInput): Promise<ReminderRecord> {
    const id = randomUUID();
    const now = Date.now();
    const recurrence = input.recurrence && VALID_RECURRENCES.has(input.recurrence) ? input.recurrence : null;
    const notifyBeforeMs = input.notifyBeforeMs != null && input.notifyBeforeMs >= 0 ? input.notifyBeforeMs : 0;
    const preNotifiedAt = notifyBeforeMs > 0 && input.dueAt.getTime() - now <= notifyBeforeMs ? now : null;

    await (
      await this.db.prepare(
        "INSERT INTO reminders (id, content, due_at, recurrence, last_fired_at, fire_count, created_at, active, notify_before_ms, pre_notified_at) VALUES (?, ?, ?, ?, NULL, 0, ?, 1, ?, ?)",
      )
    ).run(id, input.content, input.dueAt.getTime(), recurrence, now, notifyBeforeMs, preNotifiedAt);

    return {
      id,
      content: input.content,
      dueAt: input.dueAt,
      recurrence,
      lastFiredAt: null,
      fireCount: 0,
      createdAt: new Date(now),
      active: true,
      notifyBeforeMs,
      preNotifiedAt: preNotifiedAt == null ? null : new Date(preNotifiedAt),
    };
  }

  async getDue(now = new Date()): Promise<ReminderRecord[]> {
    const rows = (await (
      await this.db.prepare(
        `SELECT ${REMINDER_COLUMNS} FROM reminders WHERE active = 1 AND due_at <= ? ORDER BY due_at ASC LIMIT 20`,
      )
    ).all(now.getTime())) as Array<Record<string, unknown>>;

    return rows.map(rowToReminder);
  }

  async listActive(limit = 20): Promise<ReminderRecord[]> {
    const rows = (await (
      await this.db.prepare(
        `SELECT ${REMINDER_COLUMNS} FROM reminders WHERE active = 1 ORDER BY due_at ASC LIMIT ?`,
      )
    ).all(limit)) as Array<Record<string, unknown>>;
    return rows.map(rowToReminder);
  }

  async getUpcoming(now = new Date(), windowMs = SUGGESTED_NOTIFY_BEFORE_MS): Promise<ReminderRecord[]> {
    const rows = (await (
      await this.db.prepare(
        `SELECT ${REMINDER_COLUMNS} FROM reminders WHERE active = 1 AND due_at > ? AND ? - due_at <= notify_before_ms AND notify_before_ms > 0 AND pre_notified_at IS NULL ORDER BY due_at ASC LIMIT 20`,
      )
    ).all(now.getTime(), windowMs)) as Array<Record<string, unknown>>;

    return rows.map(rowToReminder);
  }

  async markPreNotified(id: string, at = new Date()): Promise<void> {
    await (
      await this.db.prepare("UPDATE reminders SET pre_notified_at = ? WHERE id = ?")
    ).run(at.getTime(), id);
  }

  async deactivate(id: string): Promise<boolean> {
    const info = await (
      await this.db.prepare("UPDATE reminders SET active = 0 WHERE id = ?")
    ).run(id);
    return Number(info.changes ?? 0) > 0;
  }

  async deleteByQuery(query: string): Promise<number> {
    const active = await this.listActive(200);
    const terms = query
      .split(/\s+/)
      .map((t) => t.toLowerCase())
      .filter((t) => t.length >= 3);

    if (terms.length === 0) return 0;

    let removed = 0;
    for (const reminder of active) {
      const content = reminder.content.toLowerCase();
      if (terms.some((term) => content.includes(term))) {
        if (await this.deactivate(reminder.id)) removed += 1;
      }
    }
    return removed;
  }

  async markFired(id: string, firedAt = new Date()): Promise<void> {
    await (
      await this.db.prepare(
        "UPDATE reminders SET last_fired_at = ?, fire_count = fire_count + 1 WHERE id = ?",
      )
    ).run(firedAt.getTime(), id);
  }

  async advanceRecurrence(id: string, from: Date, recurrence: Recurrence): Promise<Date | null> {
    const next = computeNextDue(from, recurrence);
    if (!next) return null;

    await (
      await this.db.prepare("UPDATE reminders SET due_at = ?, pre_notified_at = NULL WHERE id = ?")
    ).run(next.getTime(), id);
    return next;
  }
}

export function computeNextDue(from: Date, recurrence: Recurrence): Date | null {
  const next = new Date(from.getTime());

  switch (recurrence) {
    case "daily":
      next.setDate(next.getDate() + 1);
      return next;
    case "weekly":
      next.setDate(next.getDate() + 7);
      return next;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      return next;
    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      return next;
    default:
      return null;
  }
}

function rowToReminder(row: Record<string, unknown>): ReminderRecord {
  const recurrence = row.recurrence == null ? null : String(row.recurrence);
  return {
    id: String(row.id),
    content: String(row.content ?? ""),
    dueAt: new Date(Number(row.due_at ?? 0)),
    recurrence: recurrence && VALID_RECURRENCES.has(recurrence as Recurrence) ? (recurrence as Recurrence) : null,
    lastFiredAt: row.last_fired_at == null ? null : new Date(Number(row.last_fired_at)),
    fireCount: Number(row.fire_count ?? 0),
    createdAt: new Date(Number(row.created_at ?? 0)),
    active: Number(row.active ?? 0) === 1,
    notifyBeforeMs: Number(row.notify_before_ms ?? 0),
    preNotifiedAt: row.pre_notified_at == null ? null : new Date(Number(row.pre_notified_at)),
  };
}

export function isValidRecurrence(value: string): value is Recurrence {
  return VALID_RECURRENCES.has(value as Recurrence);
}