import { tool } from "ai";
import { z } from "zod";
import type { ReminderStore, Recurrence } from "../../store/reminderStore.js";
import { isValidRecurrence } from "../../store/reminderStore.js";

const recurrenceSchema = z
  .enum(["daily", "weekly", "monthly", "yearly"])
  .optional()
  .describe("Recurrencia opcional: daily, weekly, monthly o yearly. Omitilo para recordatorios de única vez.");

export function createReminderTools(reminderStore: ReminderStore) {
  const setReminder = tool({
    description:
      "Crea un recordatorio único o recurrente. El sistema avisa al usuario cuando llega la fecha y hora, y opcionalmente un poco antes. " +
      "Usalo cuando el usuario pida 'recordame...', 'avisame...', etc. " +
      "Si el usuario menciona avisar antes (ej: 'avisame media hora antes'), usá notifyBeforeMinutes con esos minutos.",
    inputSchema: z.object({
      content: z.string().describe("Qué recordar, redactado de forma clara (ej: 'Llamar al dentista')."),
      dueAt: z.string().describe("Fecha y hora del recordatorio en ISO 8601 con zona horaria (ej: '2026-09-01T09:00:00-03:00')."),
      recurrence: recurrenceSchema,
      notifyBeforeMinutes: z
        .number()
        .int()
        .min(0)
        .max(10080)
        .optional()
        .describe(
          "Minutos de aviso previo antes del vencimiento (ej: 30 = media hora antes). Omitir = sin aviso previo.",
        ),
    }),
    execute: async ({ content, dueAt, recurrence, notifyBeforeMinutes }) => {
      const date = new Date(dueAt);
      if (Number.isNaN(date.getTime())) {
        return { ok: false, error: "Fecha inválida. Usá ISO 8601 (ej: '2026-09-01T09:00:00-03:00')." };
      }

      const reminder = await reminderStore.add({
        content,
        dueAt: date,
        recurrence: recurrence && isValidRecurrence(recurrence) ? recurrence : null,
        notifyBeforeMs: notifyBeforeMinutes != null ? notifyBeforeMinutes * 60_000 : undefined,
      });

      return {
        ok: true,
        reminderId: reminder.id,
        dueAt: reminder.dueAt.toISOString(),
        recurrence: reminder.recurrence,
        notifyBeforeMinutes: Math.round(reminder.notifyBeforeMs / 60_000),
      };
    },
  });

  const listReminders = tool({
    description: "Lista los recordatorios activos, ordenados por fecha. Útil para que el usuario consulte qué tiene pendiente.",
    inputSchema: z.object({}),
    execute: async () => {
      const reminders = await reminderStore.listActive();
      return {
        reminders: reminders.map((r) => ({
          id: r.id,
          content: r.content,
          dueAt: r.dueAt.toISOString(),
          recurrence: r.recurrence,
          notifyBeforeMinutes: Math.round(r.notifyBeforeMs / 60_000),
        })),
      };
    },
  });

  const deleteReminder = tool({
    description: "Cancela recordatorios activos cuyo texto coincida con la consulta. Usala si el usuario pide cancelar o borrar un recordatorio.",
    inputSchema: z.object({
      query: z.string().describe("Palabras clave del recordatorio a cancelar."),
    }),
    execute: async ({ query }) => {
      const removed = await reminderStore.deleteByQuery(query);
      return { ok: true, removed };
    },
  });

  return { setReminder, listReminders, deleteReminder };
}