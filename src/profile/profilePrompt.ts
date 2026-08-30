export function buildProfilePrompt(sections: Record<string, string>): string {
  const entries = Object.entries(sections).filter(([, content]) => content.trim().length > 0);
  if (entries.length === 0) return "";

  const body = entries.map(([section, content]) => `### ${section}\n${content.trim()}`).join("\n\n");

  return `Perfil del usuario (mantenelo al día; usalo para personalizar tus respuestas):\n${body}`;
}