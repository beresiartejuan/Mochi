import { tool } from "ai";
import { z } from "zod";
import { page, search } from "wikipedia-api";

export const searchWikipedia = tool({
  description:
    "Busca un artículo en Wikipedia (en inglés) y devuelve su título, resumen y URL. " +
    "Para información actualizada o de actualidad usá webSearch en su lugar.",
  inputSchema: z.object({
    query: z.string().describe("Tema o título a buscar en Wikipedia, en inglés"),
  }),
  execute: async ({ query }) => {
    try {
      const result = await page(query);

      return {
        title: result.title,
        extract: result.extract,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title.replace(/ /g, "_"))}`,
      };
    } catch {
      const searchResults = await search(query, 5);

      if (searchResults.results.length === 0) {
        return { error: "No se encontró ningún artículo relacionado en Wikipedia." };
      }

      const first = searchResults.results[0]!;
      const result = await page(first.title);

      return {
        title: result.title,
        extract: result.extract,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title.replace(/ /g, "_"))}`,
      };
    }
  },
});
