# AGENTS.md

Guía para agentes que trabajen en este proyecto.

## Stack y convenciones

- TypeScript puro, módulos ES (`"type": "module"`).
- Gestión de dependencias con **pnpm** (por seguridad, scripts de build solo en `pnpm-workspace.yaml` → `onlyBuiltDependencies`); no usar npm install.
- Sin librería de bot de Telegram. Se usa `node-telegram-bot-api` solo como cliente HTTP de la API.
- Ollama Cloud vía el SDK de Vercel AI con el provider `ollama-ai-provider-v2`.
- Variables de entorno validadas con Zod en `src/config/env.ts`.
- `SUMMARY_MODEL` puede apuntar a un modelo distinto de `CHAT_MODEL`; si no se define, se usa `CHAT_MODEL`. Ídem `PROFILE_MODEL` (destilador de perfil).
- `WORKSPACE_DIR` es obligatoria y define el directorio de ejecución de la tool `executeCommand`.
- Importar archivos del proyecto con extensión `.js`, no `.ts`.

## Estructura de carpetas

- `src/bot/`: orquestación del bucle del bot.
- `src/agents/`: agentes con herramientas usando Vercel AI SDK.
- `src/config/`: envs y providers de Vercel AI.
- `src/mappers/`: transformaciones de datos externos a tipos internos.
- `src/store/`: estado en memoria (mensajes, resumen) y persistencia del último `update_id` de Telegram.
- `src/store/memoryDb.ts` + `src/store/memoryStore.ts`: memoria persistente en SQLite local vía `@tursodatabase/database` (Turso embebido). Esquema en `memoryDb.ts`; tools `remember`/`recall`/`forget` en `src/agents/tools/memoryTools.ts`. El resumen de conversación se persiste en la tabla `state` y se recarga al iniciar.
- Embeddings locales: `EmbeddingService` (`src/config/embeddingService.ts`) corre `onnx-community/embeddinggemma-300m-ONNX` con Transformers.js (dtype `q8`, ONNX Runtime CPU). Prompts obligatorios del modelo: query = `task: search result | query: {texto}`, documento = `title: none | text: {texto}`. Output 768d truncado a 256d vía MRL y renormalizado. La carga es lazy (singleton con promesa); primera ejecución descarga ~300MB al caché de HF. NO usar fp16 (las activations de EmbeddingGemma no lo soportan) ni WebGPU+q8/q4 (produce embeddings erróneos silenciosos, issue #1728 de transformers.js; en Node/wasm es seguro).
- Búsqueda de memoria híbrida: `MemoryStore.searchScored` combina FTS (`fts_match`/`fts_score`, peso 0.3) + similitud coseno (`vector_distance_cos` de Turso sobre columna `embedding`, peso 0.7), normalizando cada canal por su máximo; fallback a keywords si ambos fallan. `search()` devuelve solo los records; `searchSemantic()` expone el canal vectorial puro.
- Dedup en `MemoryStore.add()`: matcheo exacto por contenido o semántico (coseno >= 0.86) actualiza `updated_at` en vez de insertar duplicado. `purgeExpired()` borra vencidos y `backfillEmbeddings()` regenera vectores de filas sin embedding (migraciones/legado); ambos corren al inicio vía `runMemoryMaintenance` (`src/bot/botLoop.ts`).
- La primera ejecución de la app (o el primer `remember`) es lenta: descarga y compila el modelo de embeddings.
- `src/store/reminderStore.ts`: recordatorios únicos y recurrentes (daily/weekly/monthly/yearly) en la tabla `reminders`. Tools `setReminder`/`listReminders`/`deleteReminder` en `src/agents/tools/reminderTools.ts`. Entrega consolidada en `runReminderRunner` (`src/bot/reminderRunner.ts`): pre-aviso (`getUpcoming`, columnas `notify_before_ms`/`pre_notified_at`, ~30 min antes según config de cada recordatorio) + vencidos. `advanceRecurrence` resetea `pre_notified_at` para que las recurrentes re-avisen en cada ciclo.
- Perfil de usuario: `src/profile/` (`profileStore` tabla `profile_sections`, `profileService` destilador LLM con JSON por sección, `profilePrompt`). El loop (`maybeUpdateProfile` en `src/bot/botLoop.ts`) corre el destilador con los mensajes nuevos tras el marcador `PROFILE_MARKER_KEY` (tabla `state`) y lo inyecta siempre en el system prompt del agente. Regla del destilador: solo información explícita del usuario, nunca inventar.
- Recall proactivo: antes de cada respuesta, `recallProactiveMemories` (`src/bot/botLoop.ts`) busca con búsqueda híbrida (FTS + vectores) las top-5 memorias relacionadas con el mensaje entrante y las inyecta en el system prompt (`runPersonalAgent`).
- `src/summary/`: lógica de resumen de conversación.
- `src/telegram/`: polling manual y funciones de la API de Telegram.
- `src/utils/`: helpers puros sin side effects.

## Decisiones arquitectónicas

- `MessageStore` no es Singleton. Se crea una instancia en `createBotDependencies()` y se pasa explícitamente.
- El poller expone `fetchUpdates()` público para que el bucle controle el timing.
- El resumen se recalcula cuando `sum(score) > 25`. El batch de mensajes a resumir frena antes de incluir una respuesta del asistente si supera score 13 (`src/summary/summaryService.ts`).
- Orden del loop (`runBotLoop`): fetch de updates → entrega de recordatorios → respuesta del agente → destilador de perfil → resumen. Las entregas al usuario van primero; el trabajo LLM de fondo (perfil, resumen) corre al final para no bloquear avisos y respuestas.
- El bot solo responde mensajes del `CHAT_ID` autorizado, y solo si el último mensaje del usuario tiene más de 30 segundos (`src/utils/time.ts`).
- El envío de mensajes a Telegram es una tool (`sendTelegramMessage`). El agente debe usarla para responder; si no lo hace, el bucle envía el texto libre como fallback.
- El agente puede encadenar hasta 10 pasos de herramientas (`stopWhen: isStepCount(10)` en `src/agents/personalAgent.ts`).
- El último `update_id` de Telegram se persiste en `.telegram-offset.json` para evitar reprocesar mensajes antiguos entre reinicios; el archivo se ignora en `.gitignore`.
- `OLLAMA_HOST=https://ollama.com` se convierte internamente a `https://api.ollama.com/api`.
- FTS de Turso (`fts_match`/`fts_score`) requiere habilitar el flag experimental `index_method` al abrir la DB (`openMemoryDb` en `src/store/memoryDb.ts` lo maneja con fallback si no está disponible).
- La tool `executeCode` requiere Docker instalado; el resto funciona sin dependencias externas.
- `executeCommand` (`src/agents/tools/executeCommandTool.ts`) ejecuta comandos de terminal dentro de `WORKSPACE_DIR`. Rechaza comandos con `cd ..`, rutas absolutas fuera del workspace, `sudo`, redirecciones a `/etc/|/usr/|/bin/|/sbin/` y otros patrones peligrosos.
- `executeCode` (`src/agents/tools/executeCodeTool.ts`) ejecuta código Python en un contenedor Docker efímero (`python:3.13`) con `--network=none --read-only --cap-drop=ALL`, límites de 256m de RAM y 1 CPU, y timeout de 30s. El código se guarda como `main.py` en un directorio temporal montado en modo solo lectura; el contenedor se destruye siempre. Requiere Docker instalado.

## Comandos útiles

```bash
npm run dev          # tsx + carga automática de .env
npm run build        # tsc -> dist/
npm run start        # node + .env, ejecuta dist/index.js
npm run typecheck    # tsc --noEmit sin declaration emit (el SDK de AI 7 tiene tipos no portables para .d.ts)
```

No hay tests ni linters configurados; `npm run typecheck` es la única verificación local.

## Commits

Usar Conventional Commits en español. Ejemplos:

```
feat: agrega lógica de resumen
fix: corrige cálculo de score
refactor: extrae helper de mapeo
docs: actualiza README
```
