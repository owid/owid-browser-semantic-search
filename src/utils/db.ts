import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { EmbeddingRow, RecordType } from "../types";

const createDbInstance = async () => {
  // turn on persistent storage
  // if (navigator.storage && navigator.storage.persist) {
  //   const isPersisted = await navigator.storage.persist();
  //   console.log(`Persisted storage granted: ${isPersisted}`);
  // }
  const db = new PGlite("idb://owid-semantic-search", {
    extensions: {
      vector,
    },
  });
  await db.waitReady;
  await initSchema(db);
  console.log("initialized db");
  return db;
};

let dbInstance: PGlite | null = null;

export const getDb = async (): Promise<PGlite> => {
  if (!dbInstance) {
    dbInstance = await createDbInstance();
  }
  return dbInstance;
};

export const initSchema = async (db: PGlite) => {
  return await db.exec(`
    create extension if not exists vector;
    -- drop table if exists embeddings; -- Uncomment this line to reset the database
    create table if not exists embeddings (
      id bigint primary key generated always as identity,
      title text not null,
      type text not null check (type in ('chart', 'insight', 'gdoc', 'dod', 'country')),
      loc text,
      content text,
      embedding vector (384)
    );
    
    create index on embeddings using hnsw (embedding vector_ip_ops);
  `);
};

export const countRowsPerType = async (db: PGlite) => {
  const res = await db.query<{ type: RecordType; count: number }>(
    `SELECT type, COUNT(*) FROM embeddings GROUP BY type;`
  );
  return res.rows;
};

// Cosine similarity search in pgvector
export const search = async (
  db: PGlite,
  embedding: number[],
  match_threshold = 0.8,
  limit = 10
): Promise<EmbeddingRow[]> => {
  const res = await db.query<EmbeddingRow>(
    `
    select * from embeddings

    -- The inner product is negative, so we negate match_threshold
    where embeddings.embedding <#> $1 < $2

    -- Our embeddings are normalized to length 1, so cosine similarity
    -- and inner product will produce the same query results.
    -- Using inner product which can be computed faster.
    --
    -- For the different distance functions, see https://github.com/pgvector/pgvector
    order by embeddings.embedding <#> $1
    limit $3;
    `,
    [JSON.stringify(embedding), -Number(match_threshold), Number(limit)]
  );
  return res.rows;
};

export const insertEmbeddingsBatch = async (
  db: PGlite,
  results: EmbeddingRow[]
) => {
  // Prepare the placeholders for the database query, e.g. ($1, $2, $3, $4), ($5, $6, $7, $8), ...
  const placeholders = results
    .map(
      (_, rowIndex) =>
        `($${rowIndex * 5 + 1}, $${rowIndex * 5 + 2}, $${rowIndex * 5 + 3}, $${
          rowIndex * 5 + 4
        }, $${rowIndex * 5 + 5})`
    )
    .join(", ");

  await db.query(
    `INSERT INTO embeddings (title, type, loc, content, embedding) VALUES ${placeholders}`,
    results.flatMap((row) => [
      row.title,
      row.type,
      row.loc,
      row.content,
      JSON.stringify(row.embedding),
    ])
  );
};
