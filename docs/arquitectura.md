# Arquitectura

## Visión general

Mochi corre como un proceso único en Node.js: Telegram entrega mensajes vía long polling (`TelegramLongPoller`), el bucle principal (`src/bot/botLoop.ts`) los filtra y acumula en el `MessageStore`, y cuando corresponde invoca al agente (`runPersonalAgent`), que usa el Vercel AI SDK contra Ollama Cloud y puede encadenar herramientas (memoria, recordatorios, búsqueda, terminal, Docker, Telegram) antes de responder por Telegram.

## Bucle principal (`src/bot/botLoop.ts`)

En cada iteración del `while (true)`:

1. `fetchAndStoreUpdates()`: el poller hace `getUpdates` (long polling manual con offset persistido) y los mensajes se guardan en el `MessageStore`.
2. Se filtran y descartan los mensajes cuyo `chat.id` no coincide con el `CHAT_ID` autorizado.
3. `runMemoryMaintenance()` (al inicio de la app): purga memorias vencidas (`purgeExpired`) y regenera embeddings faltantes (`backfillEmbeddings`).
4. `recallProactiveMemories()`: busca las top-5 memorias relacionadas con los mensajes pendientes del usuario (búsqueda híbrida FTS + vectores) y las inyecta al system prompt del agente.
5. `maybeRecalculateSummary()`: si la suma de scores de mensajes sin resumir supera 25, recalcula el resumen de conversación.
6. `deliverDueReminders()`: entrega los recordatorios vencidos por Telegram y los reprograma (si son recurrentes) o los desactiva.
7. `maybeReply()`: si el último mensaje del usuario tiene más de 30 segundos, corre el agente. El agente responde con la tool `sendTelegramMessage`; si no la usó, se envía su texto libre como fallback via `sendTelegramMessage` directo.

## El agente (`src/agents/personalAgent.ts`)

Usa `generateText` del Vercel AI SDK con `stopWhen: isStepCount(10)`, lo que permite encadenar hasta 10 pasos de herramientas.

Orden del prompt:

1. System: personalidad + instrucciones de tools (compacto, en español rioplatense — ver `src/config/prompts.ts`).
2. System: memorias recordadas proactivamente (si las hay).
3. System: resumen actual de la conversación (max ~15 líneas).
4. Mensajes anteriores no resumidos.
5. Mensajes pendientes del usuario (los agrupados tras el debounce).

## Resumen de conversación (`src/summary/summaryService.ts`)

El score de cada mensaje es `content.length / 280`. Hay dos umbrales:

- `SUMMARY_THRESHOLD_TOTAL = 25`: cuando la suma de scores de mensajes sin resumir lo supera, se recalcula el resumen.
- `SUMMARY_BATCH_THRESHOLD = 13`: al armar el batch de mensajes a resumir, se frena antes de incluir una respuesta del asistente cuya inclusión haga superar ese score (evita meter respuestas enormes en un solo batch).

El resumen nuevo se genera fusionando el resumen previo con el batch. Se persiste en la tabla `state` de la DB de memoria y se recarga al iniciar (`loadPersistedSummary`).

## Debounce y respuestas

El bot solo responde si el último mensaje del usuario tiene más de 30 segundos (`isOlderThanReplyThreshold` en `src/utils/time.ts`). Así agrupa ráfagas de mensajes cortos en una sola respuesta en lugar de contestar cada mensaje suelto.

## Polling y offset (`src/telegram/`)

Long polling manual con `getUpdates` (`offset = lastUpdateId + 1`, `limit: 100`, `allowed_updates: ["message"]`). El último `update_id` se persiste en `.telegram-offset.json` (vía callback `onUpdateIdChange`) para no reprocesar mensajes tras reinicios.

## Store

`MessageStore` (`src/store/messageStore.ts`): mensajes en SQLite (tabla `messages`) con `author`, `content`, `date`, `score` e `is_in_summary`. Mantiene inserción ordenada por fecha, permite marcar mensajes como incluidos en el resumen y expone `takePendingUserMessages()` para agrupar la ráfaga pendiente.

## Detalles críticos

Para gotchas de red IPv4 en Telegram, límites de transformers.js y decisiones de la memoria, ver [`docs/decisiones.md`](docs/decisiones.md) y [`docs/memoria.md`](docs/memoria.md).