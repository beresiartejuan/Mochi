import type { ChatMessage } from "../store/messageStore.js";

export const MAX_SUMMARY_LINES = 8;
export const MAX_SUMMARY_WORDS = 200;

export function messagesToSummaryText(messages: ChatMessage[]): string {
  return messages
    .map((message) => `[${message.author === "user" ? "Usuario" : "Asistente"}] ${message.content}`)
    .join("\n");
}

export function buildSummaryPrompt(currentSummary: string, messages: ChatMessage[]): string {
  const conversation = messagesToSummaryText(messages);
  const maxLines = MAX_SUMMARY_LINES;
  const maxWords = MAX_SUMMARY_WORDS;

  const compactInstructions =
    `Reglas estrictas para el resumen:\n` +
    `- Máximo ${maxLines} líneas.\n` +
    `- Máximo ${maxWords} palabras.\n` +
    `- Solo datos accionables: temas tratados, decisiones, preferencias del usuario, datos clave y pendientes.\n` +
    `- No repitas información.\n` +
    `- No incluyas saludos, despedidas ni metacommentarios sobre el resumen.\n` +
    `- Respondé solo el resumen, sin texto extra.`;

  return currentSummary.trim().length > 0
    ? `Tienes este resumen previo de la conversación:\n\n${currentSummary}\n\nAhora fusionalo con la siguiente conversación y generá un único resumen compacto:\n\n${conversation}\n\n${compactInstructions}`
    : `Generá un resumen compacto de la siguiente conversación entre un usuario y un asistente:\n\n${conversation}\n\n${compactInstructions}`;
}
