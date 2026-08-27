# Ollama Cloud

## Librería

El proyecto no usa el SDK oficial de Ollama (`ollama`). En su lugar usa el **Vercel AI SDK** con el provider no oficial `ollama-ai-provider-v2` para conectar con Ollama Cloud.

```ts
import { createOllama } from "ollama-ai-provider-v2";

const provider = createOllama({
  baseURL: "https://api.ollama.com/api",
  headers: {
    Authorization: `Bearer ${process.env.OLLAMA_API_KEY}`,
  },
});

const model = provider("gpt-oss:120b");
```

## Configuración

- `OLLAMA_API_KEY`: API key de https://ollama.com.
- `OLLAMA_HOST`: host base de Ollama. Default `https://ollama.com`. Internamente se normaliza a `https://api.ollama.com/api` cuando coincide con el host público.
- `CHAT_MODEL`: modelo usado para responder al usuario.
- `SUMMARY_MODEL`: modelo usado para resumir la conversación. Si no se define, usa `CHAT_MODEL`.

## Generación de texto

Se usa `generateText` del Vercel AI SDK. El agente soporta múltiples pasos de tool calling:

```ts
import { generateText, isStepCount } from "ai";

const result = await generateText({
  model,
  system,
  messages,
  tools,
  stopWhen: isStepCount(5),
});
```

El límite de `5` steps permite al agente ejecutar herramientas (por ejemplo buscar y luego responder) antes de detenerse.

## Modelos

El modelo se define en la variable de entorno `CHAT_MODEL`.

Ejemplo: `gpt-oss:120b`.
