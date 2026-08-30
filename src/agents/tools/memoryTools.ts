import { tool } from "ai";
import { z } from "zod";
import type { MemoryStore, MemoryKind } from "../../store/memoryStore.js";
import { isValidMemoryKind } from "../../store/memoryStore.js";

export function createMemoryTools(memoryStore: MemoryStore) {
  const remember = tool({
    description:
      "Guarda un dato importante en tu memoria persistente para recordarlo en conversaciones futuras. " +
      "Usala cuando el usuario te pida que recuerdes algo, o cuando comparta un hecho estable sobre su vida, preferencias o proyectos.",
    inputSchema: z.object({
      content: z.string().describe("El dato a recordar, redactado de forma clara y autónoma (ej: 'El usuario prefiere café sin azúcar')."),
      kind: z
        .enum(["fact", "preference", "context", "event", "todo"])
        .optional()
        .describe("Tipo de memoria: fact (hecho), preference (gusto), context (situación), event (evento con fecha), todo (pendiente)."),
      expiresAt: z
        .string()
        .optional()
        .describe("Fecha de expiración opcional en ISO 8601 para datos efímeros (ej: '2026-09-01T00:00:00Z')."),
    }),
    execute: async ({ content, kind, expiresAt }) => {
      const expiresDate = expiresAt ? new Date(expiresAt) : null;
      if (expiresAt && Number.isNaN(expiresDate?.getTime())) {
        return { ok: false, error: "Fecha de expiración inválida." };
      }

      const memory = await memoryStore.add({
        content,
        kind: (kind && isValidMemoryKind(kind) ? kind : undefined) as MemoryKind | undefined,
        expiresAt: expiresDate,
      });

      return { ok: true, memoryId: memory.id };
    },
  });

  const recall = tool({
    description:
      "Busca en tu memoria persistente datos guardados previamente. " +
      "Usala cuando necesites información que el usuario te contó en conversaciones anteriores.",
    inputSchema: z.object({
      query: z.string().describe("Qué buscar en la memoria, en lenguaje natural o palabras clave."),
      limit: z.number().int().min(1).max(20).optional().describe("Cantidad máxima de resultados (default 5)."),
    }),
    execute: async ({ query, limit }) => {
      const memories = await memoryStore.search(query, limit ?? 5);
      return {
        results: memories.map((memory) => ({
          kind: memory.kind,
          content: memory.content,
          savedAt: memory.createdAt.toISOString(),
        })),
      };
    },
  });

  const forget = tool({
    description: "Elimina de tu memoria persistente los datos que coincidan con la consulta. Usala si el usuario pide olvidar algo o si un dato quedó obsoleto.",
    inputSchema: z.object({
      query: z.string().describe("Palabras clave del dato a eliminar (se borran todas las coincidencias)."),
    }),
    execute: async ({ query }) => {
      const removed = await memoryStore.remove(query);
      return { ok: true, removed };
    },
  });

  return { remember, recall, forget };
}