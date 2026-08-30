import { randomUUID } from "node:crypto";
import type { Database as TursoDatabase } from "@tursodatabase/database";
import type { EmbeddingService } from "../config/embeddingService.js";
import { EMBEDDING_DIMENSIONS } from "../config/embeddingService.js";

export type MemoryKind = "fact" | "preference" | "context" | "event" | "todo";

export type MemoryRecord = {
  id: string;
  kind: MemoryKind;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  confidence: number;
  sourceMessageId: string | null;
};

export type MemoryInput = {
  kind?: MemoryKind;
  content: string;
  expiresAt?: Date | null;
  confidence?: number;
  sourceMessageId?: string | null;
};

export type ScoredMemory = { memory: MemoryRecord; score: number };

const VALID_KINDS = new Set<MemoryKind>(["fact", "preference", "context", "event", "todo"]);

const MEMORY_COLUMNS = "id, kind, content, created_at, updated_at, expires_at, confidence, source_message_id";

const SEMANTIC_DEDUP_THRESHOLD = 0.86;
const HYBRID_SEMANTIC_WEIGHT = 0.7;
const HYBRID_FTS_WEIGHT = 0.3;
const HYBRID_CANDIDATE_POOL = 60;
const MIN_KEYWORD_LENGTH = 3;

type Embedder = Pick<EmbeddingService, "embedQuery" | "embedDocuments">;

const NO_EMBEDDER: Embedder = {
  embedQuery: async () => [],
  embedDocuments: async () => [],
};

export class MemoryStore {
  private readonly db: TursoDatabase;
  private embedder: Embedder = NO_EMBEDDER;

  constructor(db: TursoDatabase, embedder?: Embedder) {
    this.db = db;
    if (embedder) this.embedder = embedder;
  }

  setEmbedder(embedder: Embedder): void {
    this.embedder = embedder;
  }

  async add(input: MemoryInput): Promise<MemoryRecord> {
    const now = Date.now();

    const duplicate = await this.findDuplicate(input.content, input.expiresAt ?? null);
    if (duplicate) {
      await (
        await this.db.prepare("UPDATE memories SET updated_at = ?, expires_at = COALESCE(?, expires_at) WHERE id = ?")
      ).run(now, input.expiresAt?.getTime() ?? null, duplicate.id);

      return {
        ...duplicate,
        updatedAt: new Date(now),
        expiresAt: input.expiresAt ?? duplicate.expiresAt,
      };
    }

    const id = randomUUID();
    const kind = input.kind && VALID_KINDS.has(input.kind) ? input.kind : "fact";
    const vector = await this.embedder.embedDocuments([input.content]);
    const embeddingJson = vector[0] ? JSON.stringify(vector[0]) : null;

    await (
      await this.db.prepare(
        "INSERT INTO memories (id, kind, content, created_at, updated_at, expires_at, confidence, source_message_id, embedding) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
    ).run(
      id,
      kind,
      input.content,
      now,
      now,
      input.expiresAt?.getTime() ?? null,
      input.confidence ?? 1.0,
      input.sourceMessageId ?? null,
      embeddingJson,
    );

    return {
      id,
      kind,
      content: input.content,
      createdAt: new Date(now),
      updatedAt: new Date(now),
      expiresAt: input.expiresAt ?? null,
      confidence: input.confidence ?? 1.0,
      sourceMessageId: input.sourceMessageId ?? null,
    };
  }

  async search(query: string, limit = 5): Promise<MemoryRecord[]> {
    const results = await this.searchScored(query, limit);
    return results.map((result) => result.memory);
  }

  async searchScored(query: string, limit = 5): Promise<ScoredMemory[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const [queryVector, ftsMatches, semanticMatches] = await Promise.all([
      this.embedder.embedQuery(trimmed).catch(() => [] as number[]),
      this.searchFts(trimmed, HYBRID_CANDIDATE_POOL).catch(() => [] as ScoredMemory[]),
      this.searchSemantic(trimmed, HYBRID_CANDIDATE_POOL).catch(() => [] as ScoredMemory[]),
    ]);

    if (ftsMatches.length === 0 && semanticMatches.length === 0) {
      return this.searchFallback(trimmed, limit);
    }

    const ftsMax = Math.max(...ftsMatches.map((r) => r.score), 1e-9);

    const scores = new Map<string, { memory: MemoryRecord; score: number }>();
    const register = (result: ScoredMemory, weight: number, max: number) => {
      const normalized = max > 0 ? result.score / max : 0;
      const contribution = weight * normalized;
      const existing = scores.get(result.memory.id);
      if (existing) existing.score = Math.max(existing.score, contribution);
      else scores.set(result.memory.id, { memory: result.memory, score: contribution });
    };

    for (const result of semanticMatches) register(result, HYBRID_SEMANTIC_WEIGHT, 1);
    for (const result of ftsMatches) register(result, HYBRID_FTS_WEIGHT, ftsMax);

    return [...scores.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async searchSemantic(query: string, limit = 5): Promise<ScoredMemory[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const queryVector = await this.embedder.embedQuery(trimmed);
    if (queryVector.length === 0) return [];

    const rows = (await (
      await this.db.prepare(
        `SELECT ${MEMORY_COLUMNS}, vector_distance_cos(vector32(embedding), vector32(?)) AS distance
         FROM memories
         WHERE embedding IS NOT NULL AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY distance ASC LIMIT ?`,
      )
    ).all(JSON.stringify(queryVector), Date.now(), limit)) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      memory: rowToRecord(row),
      score: 1 - Number(row.distance ?? 1),
    }));
  }

  async purgeExpired(now = new Date()): Promise<number> {
    const info = await (
      await this.db.prepare("DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at <= ?")
    ).run(now.getTime());
    return Number(info.changes ?? 0);
  }

  async countMissingEmbeddings(): Promise<number> {
    const row = (await (
      await this.db.prepare("SELECT COUNT(*) AS total FROM memories WHERE embedding IS NULL")
    ).get()) as { total: number } | undefined;
    return Number(row?.total ?? 0);
  }

  async backfillEmbeddings(batchSize = 32): Promise<number> {
    let processed = 0;

    while (true) {
      const rows = (await (
        await this.db.prepare(
          `SELECT ${MEMORY_COLUMNS} FROM memories WHERE embedding IS NULL ORDER BY updated_at DESC LIMIT ?`,
        )
      ).all(batchSize)) as Array<Record<string, unknown>>;

      if (rows.length === 0) break;

      const records = rows.map(rowToRecord);
      const vectors = await this.embedder.embedDocuments(records.map((record) => record.content));

      for (const [index, record] of records.entries()) {
        const vector = vectors[index];
        if (!vector || vector.length !== EMBEDDING_DIMENSIONS) continue;
        await (
          await this.db.prepare("UPDATE memories SET embedding = ? WHERE id = ?")
        ).run(JSON.stringify(vector), record.id);
        processed += 1;
      }

      if (records.length < batchSize) break;
    }

    return processed;
  }

  async getAll(limit = 50): Promise<MemoryRecord[]> {
    const rows = (await (
      await this.db.prepare(
        `SELECT ${MEMORY_COLUMNS} FROM memories WHERE expires_at IS NULL OR expires_at > ? ORDER BY updated_at DESC LIMIT ?`,
      )
    ).all(Date.now(), limit)) as Array<Record<string, unknown>>;
    return rows.map(rowToRecord);
  }

  async remove(query: string): Promise<number> {
    const matches = await this.search(query, 100);
    let removed = 0;

    for (const memory of matches) {
      removed += await this.removeById(memory.id);
    }

    return removed;
  }

  async removeById(id: string): Promise<number> {
    const info = await (await this.db.prepare("DELETE FROM memories WHERE id = ?")).run(id);
    return Number(info.changes ?? 0);
  }

  async count(): Promise<number> {
    const row = (await (await this.db.prepare("SELECT COUNT(*) AS total FROM memories")).get()) as
      | { total: number }
      | undefined;
    return Number(row?.total ?? 0);
  }

  async getState(key: string): Promise<string | null> {
    const row = (await (await this.db.prepare("SELECT value FROM state WHERE key = ?")).get(key)) as
      | { value: unknown }
      | undefined;
    return row ? String(row.value) : null;
  }

  async setState(key: string, value: string): Promise<void> {
    await (
      await this.db.prepare(
        "INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
    ).run(key, value);
  }

  private async findDuplicate(content: string, expiresAt: Date | null): Promise<MemoryRecord | null> {
    const exact = (await (
      await this.db.prepare(
        `SELECT ${MEMORY_COLUMNS} FROM memories WHERE content = ? AND (expires_at IS NULL OR expires_at > ?) LIMIT 1`,
      )
    ).get(content, Date.now())) as Record<string, unknown> | undefined;

    if (exact) return rowToRecord(exact);

    const vector = await this.embedder.embedDocuments([content]);
    if (!vector[0]) return null;

    const rows = (await (
      await this.db.prepare(
        `SELECT ${MEMORY_COLUMNS}, vector_distance_cos(vector32(embedding), vector32(?)) AS distance
         FROM memories
         WHERE embedding IS NOT NULL AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY distance ASC LIMIT 1`,
      )
    ).all(JSON.stringify(vector[0]), Date.now())) as Array<Record<string, unknown>>;

    const nearest = rows[0];
    if (nearest && 1 - Number(nearest.distance ?? 1) >= SEMANTIC_DEDUP_THRESHOLD) {
      return rowToRecord(nearest);
    }

    return null;
  }

  private async searchFts(query: string, limit: number): Promise<ScoredMemory[]> {
    const rows = (await (
      await this.db.prepare(
        `SELECT ${MEMORY_COLUMNS}, fts_score(content, ?) AS fts_score FROM memories WHERE fts_match(content, ?) AND (expires_at IS NULL OR expires_at > ?) ORDER BY fts_score DESC, updated_at DESC LIMIT ?`,
      )
    ).all(query, query, Date.now(), limit)) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      memory: rowToRecord(row),
      score: Number(row.fts_score ?? 0),
    }));
  }

  private async searchFallback(query: string, limit: number): Promise<ScoredMemory[]> {
    const rows = (await (
      await this.db.prepare(
        `SELECT ${MEMORY_COLUMNS} FROM memories WHERE expires_at IS NULL OR expires_at > ? ORDER BY updated_at DESC LIMIT 500`,
      )
    ).all(Date.now())) as Array<Record<string, unknown>>;

    const terms = query
      .split(/\s+/)
      .map((token) => token.toLowerCase())
      .filter((token) => token.length >= MIN_KEYWORD_LENGTH);

    if (terms.length === 0) return [];

    return rows
      .map(rowToRecord)
      .filter((record) => {
        const content = record.content.toLowerCase();
        return terms.some((term) => content.includes(term));
      })
      .slice(0, limit)
      .map((memory) => ({ memory, score: 1 }));
  }
}

function rowToRecord(row: Record<string, unknown>): MemoryRecord {
  const kind = String(row.kind ?? "fact") as MemoryKind;
  return {
    id: String(row.id),
    kind: VALID_KINDS.has(kind) ? kind : "fact",
    content: String(row.content ?? ""),
    createdAt: new Date(Number(row.created_at ?? 0)),
    updatedAt: new Date(Number(row.updated_at ?? 0)),
    expiresAt: row.expires_at == null ? null : new Date(Number(row.expires_at)),
    confidence: Number(row.confidence ?? 1.0),
    sourceMessageId: row.source_message_id == null ? null : String(row.source_message_id),
  };
}

export function isValidMemoryKind(kind: string): kind is MemoryKind {
  return VALID_KINDS.has(kind as MemoryKind);
}