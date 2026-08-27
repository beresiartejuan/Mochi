# Herramientas del agente

El agente dispone de cinco tools. Se registran en `src/agents/tools/index.ts` y se pasan a `generateText` en `src/agents/personalAgent.ts`.

## `getCurrentDateTime`

Devuelve la fecha y hora actual en formato ISO 8601.

- **Origen:** `src/agents/tools/dateTools.ts`
- **Entrada:** ninguna.
- **Salida de ejemplo:** `"2026-08-27T22:30:00.000Z"`

## `getDateComponents`

Devuelve los componentes de la fecha y hora actual.

- **Origen:** `src/agents/tools/dateTools.ts`
- **Entrada:** ninguna.
- **Salida de ejemplo:**

```json
{
  "minute": 30,
  "hour": 22,
  "day": 27,
  "month": 8,
  "year": 2026,
  "iso": "2026-08-27T22:30:00.000Z"
}
```

## `searchWikipedia`

Busca un artículo en Wikipedia y devuelve un extracto.

- **Origen:** `src/agents/tools/wikipediaTool.ts`
- **Entrada:** `{ query: string }`
- **Salida:** extracto del artículo o mensaje de error.
- **Dependencias:** librería `wikipedia-api`.

## `webSearch`

Realiza una búsqueda web.

- **Origen:** `src/agents/tools/webSearchTool.ts`
- **Entrada:** `{ query: string }`
- **Salida:** resultados de búsqueda formateados como texto.
- **Configuración:** requiere `SERP_API_KEY` y/o `TAVILY_API_KEY`. Si ambas están definidas, se usa SerpApi con Tavily como fallback.

## `sendTelegramMessage`

Envía un mensaje al chat autorizado de Telegram.

- **Origen:** `src/agents/tools/telegramTool.ts`
- **Entrada:** `{ text: string }`
- **Salida:** `{ messageId: number; text: string }`.
- **Comportamiento:** es la tool que el agente debe usar SIEMPRE para responder al usuario. El bucle principal detecta los resultados de esta tool y los guarda en el store. Si el agente no la invoca, el bucle envía el texto libre como fallback.

## Multi-step tool calling

`generateText` se configura con `stopWhen: isStepCount(5)`, lo que permite al modelo encadenar herramientas. Por ejemplo:

1. Buscar en Wikipedia.
2. Analizar el resultado.
3. Enviar la respuesta por Telegram.
