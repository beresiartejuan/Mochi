# Integraciones externas

Este documento describe las integraciones con servicios externos que usa Mochi, con foco en los detalles que hay que respetar al hacer cambios.

## Telegram (`src/telegram/`)

- Se usa la librería `node-telegram-bot-api` **exclusivamente como cliente HTTP** de la API de Telegram: no se usan sus eventos ni su polling interno. El polling lo maneja el propio proyecto.
- Endpoints usados:
  - `getMe` — verificación del token en `verifyTelegramToken` (`src/telegram/telegramApi.ts`).
  - `getUpdates` — long polling manual en `TelegramLongPoller.fetchUpdates` (`src/telegram/polling.ts`): `offset = último update_id + 1`, `limit: 100`, `timeout: POLLING_TIMEOUT` (default 60s, validado con Zod en `src/config/env.ts`) y `allowed_updates: ['message']`.
  - `sendMessage` — en `sendTelegramMessage` (`src/telegram/telegramApi.ts`).
- `extractMessageFromUpdate` toma `message` o `edited_message` de cada update; cualquier otro tipo de update se ignora.

### ⚠️ La API de Telegram solo funciona por IPv4

La resolución DNS de `api.telegram.org` en ciertas redes devuelve direcciones IPv6 y, como la API de Telegram solo responde por IPv4, las requests fallan o quedan colgadas.

La solución implementada es `createIPv4Fetch` (`src/utils/createIPv4Fetch.ts`): un `fetch` custom que usa `node:https` `request` con `family: 4` para forzar IPv4. Se lo pasa al cliente al construirlo: `new Api(token, { fetch: createIPv4Fetch() })` en `telegramApi.ts`.

**Cualquier nueva integración HTTP con Telegram debe usar este fetch.** Es un punto crítico del proyecto: no borrar nunca este fetch.

## Ollama Cloud (`src/config/aiSdk.ts`)

- No se usa el SDK oficial de Ollama. Se usa el **Vercel AI SDK** con el provider no oficial `ollama-ai-provider-v2`.
- Se construye el provider con `createOllama({ baseURL: 'https://api.ollama.com/api', headers: { Authorization: 'Bearer OLLAMA_API_KEY' } })`. El modelo se toma de la env `CHAT_MODEL` (por ejemplo `gpt-oss:120b`).
- `OLLAMA_HOST` (default `https://ollama.com`) se normaliza internamente a `https://api.ollama.com/api` (`toApiBaseURL`), porque Ollama Cloud expone la API en ese endpoint.
- El agente usa `generateText` con `stopWhen: isStepCount(10)` (máximo 10 pasos de herramientas).
- `SUMMARY_MODEL` es opcional y se usa para los resúmenes de conversación; si no se define, se usa `CHAT_MODEL`.

## Búsqueda web: SerpApi + Tavily

La tool de búsqueda web (`src/agents/tools/webSearchTool.ts`) usa **SerpApi** con la env `SERP_API_KEY` como proveedor principal y **Tavily** con `TAVILY_API_KEY` como fallback. Ambas envs son opcionales: si falta una, se usa la otra; si no hay ninguna configurada, la tool reporta que no hay búsqueda disponible.

## Hugging Face / Transformers.js

Los embeddings locales corren con Transformers.js sobre un modelo ONNX de Hugging Face. Para los detalles (elección del modelo, dtype, prompts obligatorios, MRL) ver [docs/memoria.md](memoria.md) y [docs/decisiones.md](decisiones.md).