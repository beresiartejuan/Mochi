import { tool } from "ai";
import { z } from "zod";
import { getJson } from "serpapi";
import { tavily } from "@tavily/core";

function normalizeSerpapiResults(response: unknown): string {
  if (!response || typeof response !== "object") return "No se obtuvieron resultados.";
  const organic = (response as { organic_results?: Array<{ title?: string; link?: string; snippet?: string }> }).organic_results;
  if (!Array.isArray(organic) || organic.length === 0) return "No se encontraron resultados relevantes.";

  return organic
    .slice(0, 5)
    .map((result) => `- ${result.title ?? "Sin título"}\n  ${result.link ?? ""}\n  ${result.snippet ?? ""}`)
    .join("\n");
}

async function searchWithSerpapi(query: string, apiKey: string): Promise<string> {
  const response = await getJson({
    engine: "google",
    api_key: apiKey,
    q: query,
    hl: "es",
    gl: "ar",
  });

  return normalizeSerpapiResults(response);
}

async function searchWithTavily(query: string, apiKey: string): Promise<string> {
  const client = tavily({ apiKey });
  const response = await client.search(query, { searchDepth: "basic", maxResults: 5 });

  return response.results
    .map((result) => `- ${result.title}\n  ${result.url}\n  ${result.content}`)
    .join("\n");
}

export function createWebSearchTool(config: { serpApiKey?: string | undefined; tavilyApiKey?: string | undefined }) {
  return tool({
    description:
      "Busca información actualizada en internet. Intenta primero con SerpApi y, si falla, usa Tavily como respaldo.",
    inputSchema: z.object({
      query: z.string().describe("Consulta de búsqueda en lenguaje natural"),
    }),
    execute: async ({ query }) => {
      if (!config.serpApiKey && !config.tavilyApiKey) {
        return { ok: false, results: "", error: "No hay proveedores de búsqueda configurados." };
      }

      if (config.serpApiKey) {
        try {
          const result = await searchWithSerpapi(query, config.serpApiKey);
          return { ok: true, provider: "serpapi", results: result };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!config.tavilyApiKey) {
            return { ok: false, results: "", error: `SerpApi falló y no hay fallback configurado: ${message}` };
          }
        }
      }

      try {
        const result = await searchWithTavily(query, config.tavilyApiKey!);
        return { ok: true, provider: "tavily", results: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, results: "", error: `Tavily también falló: ${message}` };
      }
    },
  });
}
