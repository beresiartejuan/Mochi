# Dominio del bot

## Entidades principales

### Mensaje (`ChatMessage`)

Cada mensaje guardado en memoria tiene:

- `id`: UUID generado automáticamente.
- `author`: `"user"` o `"assistant"`.
- `content`: texto del mensaje.
- `date`: fecha del mensaje.
- `telegramMessageId`: ID original en Telegram (opcional).
- `score`: `content.length / 280`.
- `isInSummary`: `false` por defecto; pasa a `true` cuando el mensaje se incluye en un resumen.

### Resumen

- Se almacena como un string dentro de `MessageStore`.
- Inicia vacío.
- Se recalcula cuando la suma de scores de mensajes con `isInSummary = false` supera `25`.
- Para recalcular se arma un batch auxiliar desde el mensaje más viejo, incluyendo respuestas del asistente solo si el score acumulado no supera `13`.
- El resumen se envía al modelo de Ollama como contexto junto al system prompt y los mensajes no resumidos.

## Flujo del bot

1. Cada 10 segundos se fetchean updates de Telegram.
2. Se filtran mensajes del `CHAT_ID` autorizado y se agregan al store.
3. Si los mensajes sin resumir suman más de 25 puntos, se recalcula el resumen y se hace `continue`.
4. Si el último mensaje es del usuario y tiene más de 1 minuto, se responde.
5. La respuesta se envía a Telegram y se guarda en el store.

## Prompt enviado a Ollama

Orden del prompt:

1. System prompt con personalidad alegre/traviesa/picante e instrucción de responder en español.
2. System prompt con el resumen actual (puede estar vacío).
3. Mensajes anteriores no resumidos.
4. Mensajes actuales pendientes del usuario.
