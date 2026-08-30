import type { LanguageModel } from "ai";
import { generateText } from "ai";
import type { ProfileStore } from "./profileStore.js";
import { findProfileSection, PROFILE_SECTIONS } from "./profileStore.js";
import { formatError } from "../utils/error.js";

export const PROFILE_MARKER_KEY = "profile_last_message_id";

export const PROFILE_DISTILLER_SYSTEM_PROMPT = `Sos un destilador de perfil de usuario. Mantenés un perfil persistente del usuario organizado en secciones fijas: ${PROFILE_SECTIONS.join(", ")}.

Significado de cada sección:
- identity: nombre, ubicación/ciudad, zona horaria, datos personales básicos.
- work: trabajo, rol, estudios, actividad profesional.
- preferences: gustos y disgustos estables (comida, música, hobbies, herramientas).
- relationships: personas cercanas y cómo se relaciona (familia, pareja, amigos, mascotas).
- projects: proyectos personales o profesionales activos, con su estado.
- goals: metas y objetivos declarados, con plazos si los hay.
- health: salud, hábitos, rutinas de sueño/ejercicio (solo lo que comparta explícitamente).
- communication: estilo preferido de charla (tono, nivel de detalle, idioma, humor).

Recibís el perfil actual (cada sección con su texto, o '(vacía)') y una conversación nueva. Tu tarea es detectar SOLO información nueva o cambiada que el usuario reveló en esa conversación.

Reglas estrictas:
1. Respondé EXCLUSIVAMENTE con JSON válido, sin markdown ni texto extra. Formato: { "seccion": "texto actualizado" }.
2. Solo incluí secciones con cambios REALES e incrementales: escribí el texto nuevo o la corrección puntual, NO reescribas todo el contenido de la sección.
3. No inventes, no infieras ni deduzcas nada. Solo información explícita del usuario. Chit-chat trivial (saludos, charla corta sin datos) no aporta nada al perfil.
4. Si no hay nada nuevo para una sección, omitila o devolvé "". Si no cambia ninguna sección, devolvé {}.
5. Texto breve y factual, en español; máximo ~600 caracteres por sección.
6. Si el usuario corrige o pide borrar un dato del perfil, escribí la versión corregida sin el dato (nunca dejes información invalidada).`;

export const MAX_PROFILE_SECTION_CHARS = 600;

type ProfileInputMessage = { role: "user" | "assistant"; content: string };

type DistillProfileInput = {
  profileStore: ProfileStore;
  model: LanguageModel;
  messages: ProfileInputMessage[];
};

function serializeProfile(sections: Record<string, string>): string {
  const entries = PROFILE_SECTIONS.map((section) => ({ section, content: sections[section] ?? "" }));

  return entries
    .map(({ section, content }) => `### ${section}\n${content.length > 0 ? content : "(vacía)"}`)
    .join("\n\n");
}

function buildDistillerUserPrompt(currentProfile: string, messages: ProfileInputMessage[]): string {
  const conversation = messages
    .map((message) => `[${message.role === "user" ? "Usuario" : "Asistente"}] ${message.content}`)
    .join("\n");

  return `Perfil actual:\n${currentProfile}\n\nConversación nueva:\n${conversation}\n\nDevolvés solo el JSON con las secciones a actualizar (o {} si no hay cambios).`;
}

function parseProfileUpdates(rawText: string): Record<string, string> {
  const trimmed = rawText.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const parsed: unknown = JSON.parse(trimmed);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("El destilador no devolvió un objeto JSON");
  }

  const updates: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(parsed as Record<string, unknown>)) {
    const section = findProfileSection(rawKey);
    const content = typeof rawValue === "string" ? rawValue.trim() : "";
    if (!section || content.length === 0) continue;
    updates[section] = content.slice(0, MAX_PROFILE_SECTION_CHARS);
  }
  return updates;
}

export async function updateProfileFromMessages(input: DistillProfileInput): Promise<boolean> {
  const { profileStore, model, messages } = input;

  if (messages.length === 0) return false;

  const currentSections = await profileStore.getAllSections();
  const prompt = buildDistillerUserPrompt(serializeProfile(currentSections), messages);

  let rawText: string;
  try {
    const result = await generateText({ model, system: PROFILE_DISTILLER_SYSTEM_PROMPT, prompt });
    rawText = result.text;
  } catch (error) {
    console.warn("[profile] no se pudo ejecutar el destilador:", formatError(error));
    return false;
  }

  let updates: Record<string, string>;
  try {
    updates = parseProfileUpdates(rawText);
  } catch (error) {
    console.warn("[profile] el destilador devolvió JSON inválido:", formatError(error));
    return false;
  }

  const sectionNames = Object.keys(updates);
  if (sectionNames.length === 0) return false;

  await Promise.all(
    sectionNames.map((section) => {
      const content = updates[section];
      return content ? profileStore.setSection(section, content) : Promise.resolve();
    }),
  );

  console.log(`[profile] perfil actualizado: ${sectionNames.join(", ")}`);
  return true;
}