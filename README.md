# Mochi — bot personal de Telegram

Bot personal de Telegram con agente conversacional impulsado por Ollama Cloud vía Vercel AI SDK. Cuenta con memoria persistente local con búsqueda semántica, recordatorios y herramientas (terminal, búsqueda web, Wikipedia, ejecutar código Python en Docker).

## Funcionalidades

- Agente conversacional personal con Ollama Cloud (Vercel AI SDK, provider `ollama-ai-provider-v2`).
- Memoria persistente en SQLite con embeddings locales: recall semántico (vectores) + keyword (FTS), dedup automático, datos con expiración.
- Recall proactivo: inyecta memorias relevantes al system prompt antes de cada respuesta.
- Recordatorios únicos y recurrentes (diarios/semanales/mensuales/anuales) entregados por Telegram.
- Tools que el agente puede encadenar (hasta 10 pasos): recordar/recuperar/olvidar, recordatorios, fecha/hora, Wikipedia, búsqueda web (SerpApi + Tavily), enviar mensajes de Telegram, ejecutar comandos en el workspace y ejecutar código Python aislado en Docker.
- Resumen automático de la conversación cuando supera umbrales.
- Solo atiende el `CHAT_ID` autorizado; respuestas con 30 segundos de debounce.

## Configuración

Copiá `.env.example` a `.env` y completá los valores:

```bash
cp .env.example .env
```

### Obligatorias

| Variable | Descripción |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Token del bot de @BotFather. |
| `OLLAMA_API_KEY` | API key de [https://ollama.com](https://ollama.com). |
| `CHAT_ID` | Tu ID de usuario de Telegram (único chat atendido). |
| `CHAT_MODEL` | Modelo de chat de Ollama Cloud, por ejemplo `gpt-oss:120b`. |
| `WORKSPACE_DIR` | Directorio donde la tool `executeCommand` ejecuta comandos. |

### Opcionales (con defaults)

| Variable | Default | Descripción |
| --- | --- | --- |
| `OLLAMA_HOST` | `https://ollama.com` | Host de Ollama (internamente se convierte a `https://api.ollama.com/api`). |
| `SUMMARY_MODEL` | `CHAT_MODEL` | Modelo para resumir la conversación. |
| `SERP_API_KEY` | — | API key de SerpApi para búsqueda web. |
| `TAVILY_API_KEY` | — | API key de Tavily (fallback de SerpApi). |
| `POLLING_TIMEOUT` | `60` | Tiempo máximo (segundos) que Telegram retiene la request de `getUpdates` cuando no hay mensajes. |
| `POLLING_RETRY_SECONDS` | `6` | Espera ante errores de polling. |
| `MEMORY_DB_PATH` | `data/memory.db` | Ruta del archivo SQLite de memoria. |

> **Nota sobre latencia:** `getUpdates` usa long polling, así que si no hay mensajes nuevos la request se queda esperando hasta `POLLING_TIMEOUT` segundos. Para reducir el tiempo de detección de mensajes nuevos, podés bajar `POLLING_TIMEOUT` a `5` o `10` en tu `.env`.

## Scripts

```bash
npm run dev         # ejecuta con tsx y carga automática de .env
npm run build       # compila TypeScript a dist/
npm run start       # ejecuta lo compilado (node + .env, dist/index.js)
npm run typecheck   # verifica tipos con tsc --noEmit (sin declaration emit)
```

## Primer arranque

La primera ejecución descarga y compila el modelo de embeddings local (~300MB, EmbeddingGemma 300M quantizado q8 vía ONNX Runtime); la primera respuesta o el primer `remember` tardan uno o dos minutos. Luego queda cacheado.

## Requisitos

- Node.js
- pnpm (la instalación de dependencias es con pnpm, no npm)
- Docker es opcional (solo para la tool `executeCode`).

## Estructura del proyecto

```
src/
├── agents/            # agente conversacional (personalAgent) y tools/
├── bot/               # bucle principal (botLoop)
├── config/            # envs (env.ts), provider AI SDK (aiSdk.ts), prompts, embeddingService
├── mappers/           # transformaciones de mensajes de Telegram
├── store/             # persistencia: memoryDb, memoryStore, reminderStore, messageStore, offsetStore
├── summary/           # lógica de resumen de conversación
├── telegram/          # long polling manual y funciones de la API de Telegram
└── utils/             # helpers puros sin side effects
```

## Documentación

- [`docs/arquitectura.md`](docs/arquitectura.md) — flujo del bot, bucle principal, agente y resumen.
- [`docs/memoria.md`](docs/memoria.md) — memoria persistente, embeddings y búsqueda híbrida.
- [`docs/herramientas.md`](docs/herramientas.md) — tools disponibles para el agente.
- [`docs/integraciones.md`](docs/integraciones.md) — integraciones externas (Telegram, Ollama Cloud, SerpApi, Tavily, Wikipedia).
- [`docs/decisiones.md`](docs/decisiones.md) — decisiones arquitectónicas y gotchas.

## Licencia

ISC