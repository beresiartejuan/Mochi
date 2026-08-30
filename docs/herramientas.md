# Herramientas del agente

Mochi expone **12 herramientas** al modelo, registradas en `src/agents/tools/index.ts` (12 activas: 6 standalone + 3 de memoria + 3 de recordatorios) y pasadas a `generateText` en `src/agents/personalAgent.ts` con `stopWhen: isStepCount(10)` (máximo 10 pasos de tools por corrida).

Todas las tools usan el SDK de Vercel AI (`tool()` de `ai`) con schemas de entrada validados con Zod.

## 1. getCurrentDateTime

- **Fuente**: `src/agents/tools/dateTools.ts`
- **Entrada**: nada.
- **Qué hace**: devuelve la fecha y hora actual desglosada (minuto, hora, día, mes, año) más el formato ISO 8601.
- **Requisitos**: ninguno.

## 2. searchWikipedia

- **Fuente**: `src/agents/tools/wikipediaTool.ts`
- **Entrada**: `query` (tema o título a buscar).
- **Qué hace**: busca un artículo de Wikipedia y devuelve `title`, `extract` (resumen) y `url`. Si la página directa falla, hace un search y toma el primer resultado. Solo soporta inglés.
- **Requisitos**: ningún API key (usa `wikipedia-api`).

## 3. webSearch

- **Fuente**: `src/agents/tools/webSearchTool.ts`
- **Entrada**: `query` (consulta en lenguaje natural).
- **Qué hace**: búsqueda web. Intenta primero con **SerpApi** (Google, `hl: es`, `gl: ar`, top 5 resultados organic); si falla, cae a **Tavily** como fallback (básico, 5 resultados).
- **Requisitos**: `SERP_API_KEY` y/o `TAVILY_API_KEY`. Sin ninguno de los dos devuelve error; si falla SerpApi y no hay fallback, devuelve el error de SerpApi.

## 4. sendTelegramMessage

- **Fuente**: `src/agents/tools/telegramTool.ts`
- **Entrada**: `text` (texto a enviar).
- **Qué hace**: envía un mensaje al chat autorizado de Telegram. **El agente DEBE usarla SIEMPRE para responder al usuario**; si no la usa y devuelve texto libre, el loop lo envía como fallback (`maybeReply` en `src/bot/botLoop.ts`). Se puede invocar varias veces en la misma corrida para responder en tandas de mensajes cortos.
- **Requisitos**: `TELEGRAM_BOT_TOKEN` válido y `CHAT_ID` autorizado.

## 5. executeCommand

- **Fuente**: `src/agents/tools/executeCommandTool.ts`
- **Entrada**: `command` (comando de terminal, relativo al workspace).
- **Qué hace**: ejecuta comandos de terminal dentro de `WORKSPACE_DIR` con timeout de 120s. Devuelve `stdout` (máx 8.000 chars) y `stderr` (máx 4.000 chars).
- **Seguridad** (`validateCommand`): rechaza con regex `DANGEROUS_PATTERNS`:
  - `cd ..`, `cd` a rutas absolutas, o rutas absolutas fuera del workspace.
  - `sudo` (en pipes/backticks).
  - Redirecciones a `/etc/`, `/usr/`, `/bin/`, `/sbin/`.
  - `rm -rf /`, `mkfs`, `dd` sobre `/dev`, `$( rm ...` y otros patrones peligrosos.
  - Comandos de sistema: `shutdown`, `reboot`, `halt`, `poweroff`.
- **Requisitos**: `WORKSPACE_DIR` definida en el env.

## 6. executeCode

- **Fuente**: `src/agents/tools/executeCodeTool.ts`
- **Entrada**: `code` (código Python).
- **Qué hace**: ejecuta Python 3.13 en un contenedor Docker efímero (`python:3.13`), corriendo `python /code/main.py`. El código se escribe como `main.py` en un directorio temporal montado **read-only** (`-v ${tempDir}:/code:ro`). Devuelve stdout, stderr y código de salida.
- **Hardening del contenedor**:
  - `--network=none` (sin red)
  - `--read-only --tmpfs /tmp` (filesystem de solo lectura)
  - `--cap-drop=ALL --security-opt=no-new-privileges`
  - 256MB de RAM (`--memory=256m`), 1 CPU (`--cpus=1`)
  - Timeout de 30s
- El contenedor se destruye siempre (`--rm` + cleanup en `finally`, con `docker rm -f` por si quedó colgado).
- **Requisitos**: Docker instalado. Sin Docker esta tool falla; el resto del bot funciona sin él.

## 7. remember

- **Fuente**: `src/agents/tools/memoryTools.ts`
- **Entrada**: `content` (dato a recordar, redactado autónomo), `kind` opcional (`fact`/`preference`/`context`/`event`/`todo`), `expiresAt` (ISO 8601 opcional para datos efímeros), `confidence`.
- **Qué hace**: guarda una memoria persistente en SQLite con dedup semántico automático (ver `docs/memoria.md`).
- **Requisitos**: embedding model descargado (primera vez puede tardar).

## 8. recall

- **Fuente**: `src/agents/tools/memoryTools.ts`
- **Entrada**: `query` (lenguaje natural o keywords) + `limit` (1-20, default 5).
- **Qué hace**: busca en la memoria persistente usando la búsqueda híbrida (FTS + vectores). Devuelve kind, content y fecha de guardado.
- **Requisitos**: ídem `remember`. Nota: además de esta tool, el bot inyecta automáticamente las top-5 memorias relacionadas al system prompt (recall proactivo).

## 9. forget

- **Fuente**: `src/agents/tools/memoryTools.ts`
- **Entrada**: `query` (palabras clave del dato a eliminar).
- **Qué hace**: borra todas las memorias que coincidan con la query usando búsqueda semántica (hasta 100 resultados).
- **Requisitos**: ídem `remember`.

## 10. setReminder

- **Fuente**: `src/agents/tools/reminderTools.ts`
- **Entrada**: `content` (qué recordar), `dueAt` (ISO 8601 con zona horaria), `recurrence` opcional (`daily`/`weekly`/`monthly`/`yearly`).
- **Qué hace**: crea un recordatorio único o recurrente en la tabla `reminders` (vía `ReminderStore`). El loop del bot (`deliverDueReminders` en `src/bot/botLoop.ts`) los entrega por Telegram cuando vencen; los recurrentes se reprograman y los únicos se desactivan.
- **Requisitos**: none además de los envs del bot.

## 11. listReminders

- **Fuente**: `src/agents/tools/reminderTools.ts`
- **Entrada**: nada.
- **Qué hace**: lista los recordatorios activos (`ReminderStore.listActive()`), ordenados por fecha, con id, contenido, fecha y recurrencia.
- **Requisitos**: none.

## 12. deleteReminder

- **Fuente**: `src/agents/tools/reminderTools.ts`
- **Entrada**: `query` (palabras clave del recordatorio a cancelar).
- **Qué hace**: cancela recordatorios activos cuyo texto coincida con la consulta (vía `ReminderStore.deleteByQuery`).
- **Requisitos**: none.

## Patrón multi-step

El agente puede encadenar hasta **10 pasos de herramientas** en una sola corrida (`stopWhen: isStepCount(10)` en `src/agents/personalAgent.ts`). Esto permite flujos de varios pasos sin devolver el control al loop:

```
usuario: "¿qué dice la wiki sobre el efecto Doppler?"
  paso 1: getCurrentDateTime()              → sabe la fecha actual
  paso 2: searchWikipedia("Doppler effect") → obtiene el extracto
  paso 3: sendTelegramMessage("...")        → responde al usuario
```

Otro ejemplo típico con búsqueda web:

```
usuario: "¿qué tal el dólar hoy?"
  paso 1: webSearch("cotización dólar hoy")
  paso 2: sendTelegramMessage("Según ...")
```

Si el agente termina sin haber llamado a `sendTelegramMessage`, el loop toma el texto libre final y lo envía como fallback al chat autorizado (ver `maybeReply` en `src/bot/botLoop.ts`). La respuesta final debe salir siempre por esa tool.