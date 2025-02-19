export enum WorkerMessage {
  SEARCH = "search",
  SEARCH_RESULTS = "search-results",
  PROGRESS_MODEL = "progress_model",
  PROGRESS = "progress",
  GENERATE_EMBEDDINGS = "generate-embeddings",
  EMBEDDINGS_GENERATED = "embeddings-generated",
  DB_READY = "db-ready",
  DB_STATS = "db-stats",
}

export type RecordType = "chart" | "insight" | "gdoc" | "dod" | "country";

export type CoredumpJsonRaw = Array<{
  title?: string;
  type?: string;
  loc?: string;
  content?: string;
  lastmod?: string;
}>;

export interface RowToEmbed {
  title: string;
  type: RecordType;
  loc: string | null;
  content: string | null;
  lastmod: string | null;
}

export type Embedding = number[];
export type EmbeddingRow = RowToEmbed & {
  embedding: Embedding;
};

export const parseCoredumpJson = (json: CoredumpJsonRaw): RowToEmbed[] => {
  return json
    .map((item) => {
      if (!isValidType(item.type)) return;
      if (!item.title) return;
      return {
        title: item.title,
        type: item.type,
        loc: item.loc || null,
        content: item.content || null,
        lastmod: item.lastmod || null,
      };
    })
    .filter((x): x is RowToEmbed => !!x);
};

export const isValidType = (type?: string): type is RecordType => {
  if (!type) return false;
  return ["chart", "insight", "gdoc", "dod", "country"].includes(type);
};
