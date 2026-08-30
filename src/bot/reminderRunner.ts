import type { ReminderStore } from "../store/reminderStore.js";
import { formatError } from "../utils/error.js";

const PRE_NOTIFY_WINDOW_MS = 30 * 60_000;

export async function runReminderRunner(deps: {
  reminderStore: ReminderStore;
  sendTelegramMessage: (chatId: string, text: string) => Promise<unknown>;
  chatId: string;
}): Promise<void> {
  const now = new Date();

  await deliverPreNotifications(deps, now);
  await deliverDueReminders(deps, now);
}

async function deliverPreNotifications(
  deps: {
    reminderStore: ReminderStore;
    sendTelegramMessage: (chatId: string, text: string) => Promise<unknown>;
    chatId: string;
  },
  now: Date,
): Promise<void> {
  let upcoming: Awaited<ReturnType<ReminderStore["getUpcoming"]>>;

  try {
    upcoming = await deps.reminderStore.getUpcoming(now, PRE_NOTIFY_WINDOW_MS);
  } catch (error) {
    console.error("[reminderRunner] error buscando próximos recordatorios:", formatError(error));
    return;
  }

  for (const reminder of upcoming) {
    const text = `⏰ Aviso: falta ~${formatMinutesUntil(reminder.dueAt, now)} para: ${reminder.content}`;
    try {
      await deps.sendTelegramMessage(deps.chatId, text);
      await deps.reminderStore.markPreNotified(reminder.id, now);
    } catch (error) {
      console.error("[reminderRunner] error enviando pre-aviso:", formatError(error));
    }
  }
}

async function deliverDueReminders(
  deps: {
    reminderStore: ReminderStore;
    sendTelegramMessage: (chatId: string, text: string) => Promise<unknown>;
    chatId: string;
  },
  now: Date,
): Promise<void> {
  let due: Awaited<ReturnType<ReminderStore["getDue"]>>;

  try {
    due = await deps.reminderStore.getDue(now);
  } catch (error) {
    console.error("[reminderRunner] error buscando recordatorios vencidos:", formatError(error));
    return;
  }

  for (const reminder of due) {
    const text = `⏰ Recordatorio: ${reminder.content}`;
    try {
      await deps.sendTelegramMessage(deps.chatId, text);
      await deps.reminderStore.markFired(reminder.id, now);

      if (reminder.recurrence) {
        await deps.reminderStore.advanceRecurrence(reminder.id, reminder.dueAt, reminder.recurrence);
      } else {
        await deps.reminderStore.deactivate(reminder.id);
      }
    } catch (error) {
      console.error("[reminderRunner] error entregando recordatorio:", formatError(error));
    }
  }
}

function formatMinutesUntil(dueAt: Date, now: Date): string {
  const minutes = Math.ceil((dueAt.getTime() - now.getTime()) / 60_000);
  if (minutes < 1) return "menos de un minuto";
  return `${minutes} min`;
}