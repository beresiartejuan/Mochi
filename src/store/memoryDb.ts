import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { connect, type Database as TursoDatabase } from "@tursodatabase/database";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'fact',
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER,
  confidence REAL NOT NULL DEFAULT 1.0,
  source_message_id TEXT,
  embedding TEXT
);

CREATE INDEX IF NOT EXISTS idx_memories_kind ON memories (kind);
CREATE INDEX IF NOT EXISTS idx_memories_expires ON memories (expires_at);

CREATE INDEX IF NOT EXISTS idx_memories_fts ON memories USING fts (content) WITH (tokenizer = 'simple');

CREATE TABLE IF NOT EXISTS state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  date INTEGER NOT NULL,
  telegram_message_id INTEGER,
  score REAL NOT NULL,
  is_in_summary INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  recurrence TEXT,
  last_fired_at INTEGER,
  fire_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  notify_before_ms INTEGER NOT NULL DEFAULT 0,
  pre_notified_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders (due_at, active);

CREATE TABLE IF NOT EXISTS profile_sections (
  section TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

export async function openMemoryDb(path: string): Promise<TursoDatabase> {
  await mkdir(dirname(path), { recursive: true });

  const db = await connectWithExperimentalFts(path);
  await db.exec(SCHEMA_SQL);
  await migrateSchema(db);

  return db;
}

const MIGRATIONS: Array<{ name: string; sql: string }> = [
  {
    name: "memories_embedding_column",
    sql: "ALTER TABLE memories ADD COLUMN embedding TEXT",
  },
  {
    name: "reminders_notify_columns",
    sql: "ALTER TABLE reminders ADD COLUMN notify_before_ms INTEGER NOT NULL DEFAULT 0",
  },
  {
    name: "reminders_pre_notified_column",
    sql: "ALTER TABLE reminders ADD COLUMN pre_notified_at INTEGER",
  },
];

async function migrateSchema(db: TursoDatabase): Promise<void> {
  for (const migration of MIGRATIONS) {
    try {
      await db.exec(migration.sql);
    } catch {
      // La columna ya existe; la migración es idempotente en la práctica.
    }
  }
}

async function connectWithExperimentalFts(path: string): Promise<TursoDatabase> {
  try {
    return await connect(path, { experimental: ["index_method"] });
  } catch {
    return await connect(path);
  }
}