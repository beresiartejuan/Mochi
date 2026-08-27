# AGENTS.md

Guía para agentes que trabajen en este proyecto.

## Stack y convenciones

- TypeScript puro, módulos ES (`"type": "module"`).
- Sin librería de bot de Telegram. Se usa `node-telegram-bot-api` solo como cliente HTTP de la API.
- Ollama Cloud vía el SDK de Vercel AI con el provider `ollama-ai-provider-v2`.
- Variables de entorno validadas con Zod en `src/config/env.ts`.
- `SUMMARY_MODEL` puede apuntar a un modelo distinto de `CHAT_MODEL`; si no se define, se usa `CHAT_MODEL`.
- Importar archivos del proyecto con extensión `.js`, no `.ts`.

## Estructura de carpetas

- `src/bot/`: orquestación del bucle del bot.
- `src/agents/`: agentes con herramientas usando Vercel AI SDK.
- `src/config/`: envs y providers de Vercel AI.
- `src/mappers/`: transformaciones de datos externos a tipos internos.
- `src/store/`: estado en memoria (mensajes, resumen) y persistencia del último `update_id` de Telegram.
- `src/summary/`: lógica de resumen de conversación.
- `src/telegram/`: polling manual y funciones de la API de Telegram.
- `src/utils/`: helpers puros sin side effects.

## Decisiones arquitectónicas

- `MessageStore` no es Singleton. Se crea una instancia en `createBotDependencies()` y se pasa explícitamente.
- El poller expone `fetchUpdates()` público para que el bucle controle el timing.
- El resumen se recalcula cuando `sum(score) > 25`. El batch de mensajes a resumir frena antes de incluir una respuesta del asistente si supera score 13.
- El bot solo responde mensajes del `CHAT_ID` autorizado, y solo si el último mensaje del usuario tiene más de 1 minuto.
- El envío de mensajes a Telegram es una tool (`sendTelegramMessage`). El agente debe usarla para responder; si no lo hace, el bucle envía el texto libre como fallback.
- El último `update_id` de Telegram se persiste en `.telegram-offset.json` para evitar reprocesar mensajes antiguos entre reinicios.
- `OLLAMA_HOST=https://ollama.com` se convierte internamente a `https://api.ollama.com/api`.

## Comandos útiles

```bash
npm run dev
npm run typecheck
npm run build
```

## Commits

Usar Conventional Commits en español. Ejemplos:

```
feat: agrega lógica de resumen
fix: corrige cálculo de score
refactor: extrae helper de mapeo
docs: actualiza README
```
