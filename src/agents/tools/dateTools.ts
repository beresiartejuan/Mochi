import { tool } from "ai";
import { z } from "zod";

export const getCurrentDateTime = tool({
  description: "Obtiene la fecha y hora actual del sistema en formato ISO 8601.",
  inputSchema: z.object({}),
  execute: async () => {
    return new Date().toISOString();
  },
});

export const getDateComponents = tool({
  description: "Obtiene los componentes de la fecha y hora actual: minuto, hora, día, mes y año.",
  inputSchema: z.object({}),
  execute: async () => {
    const now = new Date();

    return {
      minute: now.getMinutes(),
      hour: now.getHours(),
      day: now.getDate(),
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      iso: now.toISOString(),
    };
  },
});
