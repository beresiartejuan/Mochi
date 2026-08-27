# Ollama Cloud

## Librería

SDK oficial: `ollama`.

## Configuración

```ts
const ollama = new Ollama({
  host: "https://ollama.com",
  headers: {
    Authorization: `Bearer ${process.env.OLLAMA_API_KEY}`,
  },
});
```

## Chat

Se usa `stream: false` para obtener la respuesta completa de una sola vez.

```ts
const response = await ollama.chat({
  model,
  messages,
  stream: false,
});
```

## Modelos

El modelo se define en la variable de entorno `CHAT_MODEL`.

Ejemplo: `gpt-oss:120b`.
