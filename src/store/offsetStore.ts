import { readFile, writeFile } from "node:fs/promises";

const OFFSET_FILE_PATH = ".telegram-offset.json";

type OffsetFile = {
  lastUpdateId: number;
};

export async function loadLastUpdateId(): Promise<number> {
  try {
    const raw = await readFile(OFFSET_FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as OffsetFile;

    if (typeof parsed.lastUpdateId === "number" && Number.isFinite(parsed.lastUpdateId)) {
      return parsed.lastUpdateId;
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      console.warn("[offsetStore] no se pudo cargar el offset; se empieza desde 0:", error);
    }
  }

  return 0;
}

export async function saveLastUpdateId(lastUpdateId: number): Promise<void> {
  await writeFile(OFFSET_FILE_PATH, JSON.stringify({ lastUpdateId }, null, 2), "utf-8");
}
