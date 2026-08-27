# API de Telegram usada

El bot usa `node-telegram-bot-api` exclusivamente como cliente HTTP. No usa eventos ni polling interno de la librería.

## Endpoints usados

### `getMe`

Verifica que el token funcione. Disponible en `verifyTelegramToken()`.

### `getUpdates`

Long polling manual. Parámetros:

- `offset`: último `update_id` + 1.
- `limit`: 100.
- `timeout`: 60 segundos por defecto.
- `allowed_updates`: `["message"]`.

Implementado en `TelegramLongPoller.fetchUpdates()`.

### `sendMessage`

Envía la respuesta del modelo al chat. Disponible en `sendTelegramMessage(api, chatId, text)`.

## Extracción de mensajes

`extractMessageFromUpdate(update)` toma `message` o `edited_message` del update, si existen.
