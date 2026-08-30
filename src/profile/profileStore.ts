import type { Database as TursoDatabase } from "@tursodatabase/database";

export const PROFILE_SECTIONS = [
  "identity",
  "work",
  "preferences",
  "relationships",
  "projects",
  "goals",
  "health",
  "communication",
] as const;

export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

const SECTIONS_BY_KEY = new Map<string, ProfileSection>(
  PROFILE_SECTIONS.map((section) => [section.toLowerCase(), section]),
);

export function findProfileSection(section: string): ProfileSection | null {
  return SECTIONS_BY_KEY.get(section.trim().toLowerCase()) ?? null;
}

export class ProfileStore {
  private readonly db: TursoDatabase;

  constructor(db: TursoDatabase) {
    this.db = db;
  }

  async getSection(section: string): Promise<string | null> {
    const row = (await (
      await this.db.prepare("SELECT content FROM profile_sections WHERE section = ?")
    ).get(section)) as { content: unknown } | undefined;
    return row ? String(row.content) : null;
  }

  async getAllSections(): Promise<Record<string, string>> {
    const rows = (await (
      await this.db.prepare("SELECT section, content FROM profile_sections ORDER BY section")
    ).all()) as Array<Record<string, unknown>>;

    const sections: Record<string, string> = {};
    for (const row of rows) {
      const content = String(row.content ?? "").trim();
      if (content.length === 0) continue;
      sections[String(row.section ?? "")] = content;
    }
    return sections;
  }

  async setSection(section: string, content: string): Promise<void> {
    await (
      await this.db.prepare(
        `INSERT INTO profile_sections (section, content, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(section) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
      )
    ).run(section, content, Date.now());
  }

  async deleteSection(section: string): Promise<void> {
    await (await this.db.prepare("DELETE FROM profile_sections WHERE section = ?")).run(section);
  }
}