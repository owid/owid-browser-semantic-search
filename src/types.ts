export enum WorkerMessage {
  REQUEST_EMBEDDING = "request-embedding",
  RETURN_EMBEDDING = "return-embedding",
  PROGRESS = "progress",
  GENERATE_EMBEDDINGS = "generate-embeddings",
  EMBEDDINGS_GENERATED = "embeddings-generated",
}

export type CoredumpJsonRaw = Array<{
  title?: string;
  type?: string;
  loc?: string;
  content?: string;
  lastmod?: string;
}>;

export interface RowToEmbed {
  title: string;
  type: "chart" | "insight" | "article";
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

export const isValidType = (
  type?: string
): type is "chart" | "insight" | "article" => {
  if (!type) return false;
  return ["chart", "insight", "article"].includes(type);
};
