import type { FeatureExtractionPipeline } from "@huggingface/transformers";
import { pipeline } from "@huggingface/transformers";

export const EMBEDDING_DIMENSIONS = 256;

const MODEL_ID = "onnx-community/embeddinggemma-300m-ONNX";
const QUERY_PREFIX = "task: search result | query: ";
const DOCUMENT_PREFIX = "title: none | text: ";

export type EmbeddingServiceOptions = {
  dtype?: "fp32" | "q8";
};

export class EmbeddingService {
  private extractor: FeatureExtractionPipeline | null = null;
  private loading: Promise<void> | null = null;
  private readonly dtype: "fp32" | "q8";

  constructor(options: EmbeddingServiceOptions = {}) {
    this.dtype = options.dtype ?? "q8";
  }

  async ready(): Promise<void> {
    if (this.extractor) return;
    this.loading ??= this.load();
    await this.loading;
  }

  private async load(): Promise<void> {
    this.extractor = await pipeline("feature-extraction", MODEL_ID, { dtype: this.dtype });
  }

  async embedQuery(text: string): Promise<number[]> {
    await this.ready();
    const [vector] = await this.run([QUERY_PREFIX + text]);
    return vector ?? [];
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    await this.ready();
    if (texts.length === 0) return [];
    return this.run(texts.map((t) => DOCUMENT_PREFIX + t));
  }

  private async run(texts: string[]): Promise<number[][]> {
    const output = await this.extractor!(texts, { pooling: "mean", normalize: true });
    const list = output.tolist() as number[][];

    return list.map((vector) => truncateMRL(vector, EMBEDDING_DIMENSIONS));
  }
}

function truncateMRL(vector: number[], dimensions: number): number[] {
  const sliced = vector.slice(0, dimensions);
  const norm = Math.sqrt(sliced.reduce((sum, value) => sum + value * value, 0)) || 1;
  return sliced.map((value) => value / norm);
}