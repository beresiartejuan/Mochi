# AGENTS.md

Guía para agentes que trabajen en este proyecto.

## Stack y convenciones

- TypeScript puro, módulos ES (`"type": "module"`).
- Sin librería de bot de Telegram. Se usa `node-telegram-bot-api` solo como cliente HTTP de la API.
- Ollama Cloud vía el SDK oficial `ollama` con autenticación por API key.
- Variables de entorno validadas con Zod en `src/config/env.ts`.
- Importar archivos del proyecto con extensión `.js`, no `.ts`.

## Estructura de carpetas

- `src/bot/`: orquestación del bucle del bot.
- `src/config/`: envs y agente de Ollama.
- `src/mappers/`: transformaciones de datos externos a tipos internos.
- `src/store/`: estado en memoria (mensajes, resumen).
- `src/summary/`: lógica de resumen de conversación.
- `src/telegram/`: polling manual y funciones de la API de Telegram.
- `src/utils/`: helpers puros sin side effects.

## Decisiones arquitectónicas

- `MessageStore` no es Singleton. Se crea una instancia en `createBotDependencies()` y se pasa explícitamente.
- El poller expone `fetchUpdates()` público para que el bucle controle el timing.
- El resumen se recalcula cuando `sum(score) > 25`. El batch de mensajes a resumir frena antes de incluir una respuesta del asistente si supera score 13.
- El bot solo responde mensajes del `CHAT_ID` autorizado, y solo si el último mensaje del usuario tiene más de 1 minuto.

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
