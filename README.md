# Mochi

Bot personal de Telegram con un agente conversacional respaldado por Ollama Cloud. Hecho en TypeScript sin frameworks de bot, usando long polling manual y el Vercel AI SDK.

## Funcionalidades

- Recibe mensajes de un chat personal autorizado por `CHAT_ID`.
- Responde con un agente conversacional basado en Vercel AI SDK y Ollama Cloud.
- Puede llamar herramientas (tools): enviar mensajes por Telegram, fecha/hora, búsqueda en Wikipedia y búsqueda web con SerpApi/Tavily.
- Mantiene una lista ordenada de mensajes en memoria.
- Persiste el último `update_id` de Telegram para no reprocesar mensajes viejos tras reinicios.
- Resume la conversación cuando el acumulado de mensajes supera ciertos umbrales.
- Personalidad alegre, traviesa y un poquito picante, siempre en español.

## Configuración

Copiá `.env.example` a `.env` y completá los valores:

```bash
cp .env.example .env
```

Variables obligatorias:

- `TELEGRAM_BOT_TOKEN`: token del bot de @BotFather.
- `OLLAMA_API_KEY`: API key de https://ollama.com.
- `CHAT_ID`: tu ID de usuario de Telegram.
- `CHAT_MODEL`: modelo de Ollama Cloud, por ejemplo `gpt-oss:120b`.

Variables opcionales:

- `OLLAMA_HOST`: default `https://ollama.com` (internamente se convierte a `https://api.ollama.com/api`).
- `SUMMARY_MODEL`: modelo para resumir la conversación. Si no se define, usa `CHAT_MODEL`.
- `SERP_API_KEY`: API key de SerpApi para búsqueda web.
- `TAVILY_API_KEY`: API key de Tavily para búsqueda web (fallback de SerpApi).
- `POLLING_TIMEOUT`: default `60`.
- `POLLING_RETRY_SECONDS`: default `6`.

## Scripts

```bash
npm run dev      # ejecuta con tsx y carga .env
npm run build    # compila TypeScript a dist/
npm run start    # ejecuta lo compilado
npm run typecheck # verifica tipos sin emitir
```

## Estructura del proyecto

```
src/
├── agents/
│   ├── personalAgent.ts     # agente conversacional con herramientas
│   └── tools/               # herramientas del agente
├── bot/botLoop.ts           # bucle principal del bot
├── config/env.ts            # validación de envs con Zod
├── config/aiSdk.ts          # provider de Vercel AI para Ollama Cloud
├── mappers/messageMapper.ts # conversión de mensajes de Telegram
├── store/messageStore.ts    # lista ordenada de mensajes en memoria
├── store/offsetStore.ts     # persistencia del último update_id de Telegram
├── summary/summaryService.ts# lógica de resumen
├── telegram/polling.ts      # long polling manual
├── telegram/telegramApi.ts  # funciones de la API de Telegram
└── utils/time.ts            # helpers de tiempo
```

## Licencia

ISC
