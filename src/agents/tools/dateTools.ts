import { tool } from "ai";
import { z } from "zod";

export const getCurrentDateTime = tool({
  description: "Obtiene la fecha y hora actual del sistema. Usala para calcular fechas de recordatorios o responder preguntas sobre la hora.",
  inputSchema: z.object({}),
  execute: async () => {
    const now = new Date();

    return {
      day: now.getDate(),
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      hour: now.getHours(),
      minute: now.getMinutes(),
      weekday: now.toLocaleDateString("es-AR", { weekday: "long" }),
      iso: now.toISOString(),
    };
  },
});