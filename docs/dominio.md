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

El bucle principal (`runBotLoop`) itera continuamente, sin sleeps artificiales entre iteraciones. En cada vuelta:

1. Se fetchean updates de Telegram mediante `getUpdates` con long polling.
2. Se filtran mensajes del `CHAT_ID` autorizado y se agregan al store.
3. Si los mensajes sin resumir suman más de `25` puntos, se recalcula el resumen y se saltea el resto de la vuelta.
4. Si el último mensaje es del usuario y tiene más de `30` segundos, se responde.
   - Se extraen los mensajes pendientes del usuario (desde el último mensaje del asistente hacia atrás).
   - Se arma el prompt con resumen + mensajes anteriores no resumidos + mensajes pendientes.
   - El agente ejecuta `generateText` con hasta `5` steps.
5. Si el agente envió mensajes por la tool `sendTelegramMessage`, se guardan en el store.
   Si no, el bucle envía el texto libre como fallback.

## Prompt enviado al modelo

Orden del prompt:

1. System prompt con personalidad amable, clara y servicial, e instrucción de responder en español.
2. System prompt con instrucciones de uso de herramientas.
3. System prompt con el resumen actual (puede estar vacío).
4. Mensajes anteriores no resumidos.
5. Mensajes actuales pendientes del usuario.

## Latencia y polling

- Telegram `getUpdates` usa long polling: si no hay mensajes, la request espera hasta `POLLING_TIMEOUT` segundos.
- El bucle no agrega pausas adicionales, así que la única espera forzada es la de Telegram.
- Para detectar mensajes más rápido, se puede reducir `POLLING_TIMEOUT` en el `.env`.
