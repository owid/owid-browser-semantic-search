import {
  FeatureExtractionPipeline,
  pipeline,
  ProgressCallback,
  ProgressInfo,
} from "@huggingface/transformers";
import {
  countRowsPerType,
  getDb,
  insertEmbeddingsBatch,
  search,
} from "./utils/db";
import {
  Embedding,
  EmbeddingRow,
  parseCoredumpJson,
  RecordType,
  WorkerMessage,
} from "./types";
import { PGlite } from "@electric-sql/pglite";

// Singleton to lazily instantiate the feature-extraction pipeline.
class PipelineSingleton {
  static model = "Supabase/gte-small";
  static instance: Promise<FeatureExtractionPipeline>;

  static async getInstance(
    progress_callback: ProgressCallback
  ): Promise<FeatureExtractionPipeline> {
    if (!this.instance) {
      this.instance = pipeline("feature-extraction", this.model, {
        progress_callback,
        dtype: "fp32",
        //@ts-expect-error navigator.gpu is experimental
        device: navigator.gpu ? "webgpu" : "wasm",
      });
    }
    return this.instance;
  }
}

const db = await getDb();
self.postMessage({ status: WorkerMessage.DB_READY });

const reportProgress = (info: ProgressInfo) => {
  // We add a progress callback to the pipeline so that we can
  // track model loading.
  self.postMessage({ status: WorkerMessage.PROGRESS_MODEL, progress: info });
};

const generateEmbeddingsForItems = async (db: PGlite) => {
  console.log("Generating embeddings for items");

  const response = await fetch("http://localhost:3030/coredump.json");
  const coredumpItems = parseCoredumpJson(await response.json());

  const items = coredumpItems;

  const batchSize = 100;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results: EmbeddingRow[] = [];
    console.log(`Starting embedding batch ${i / batchSize + 1}`);
    for (const item of batch) {
      // Get the embedding output from the pipeline.
      const embedding = await getEmbeddingFor(item.title);
      results.push({ ...item, embedding });
    }
    console.log(`Inserting batch ${i / batchSize + 1}`);
    await insertEmbeddingsBatch(db, results);
    console.log(`Batch ${i / batchSize + 1} inserted successfully`);
    self.postMessage({
      status: WorkerMessage.PROGRESS,
      progress: {
        current: Math.min(i + batchSize, items.length),
        total: items.length,
      },
    });
  }
};

// Listen for messages to start generating embeddings.
self.addEventListener("message", async (event) => {
  console.log("Worker received message:", event.data);

  switch (event.data.cmd) {
    case WorkerMessage.GENERATE_EMBEDDINGS: {
      await db.query("DELETE FROM embeddings");
      await generateEmbeddingsForItems(db);
      const rowsPerType = await countRowsPerType(db);
      self.postMessage({ status: WorkerMessage.EMBEDDINGS_GENERATED });
      self.postMessage({
        status: WorkerMessage.DB_STATS,
        dbStats: rowsPerType,
      });
      break;
    }
    case WorkerMessage.SEARCH: {
      const embedding = await getEmbeddingFor(event.data.text);
      const searchTypes: RecordType[] = event.data.searchTypes;
      const searchResults = await search(db, embedding, searchTypes);
      self.postMessage({ status: WorkerMessage.SEARCH_RESULTS, searchResults });
      break;
    }
    case WorkerMessage.DB_STATS: {
      const rowsPerType = await countRowsPerType(db);
      self.postMessage({
        status: WorkerMessage.DB_STATS,
        dbStats: rowsPerType,
      });
      break;
    }
    default:
      console.warn("Unknown command:", event.data.cmd);
  }
});

const getEmbeddingFor = async (text: string): Promise<Embedding> => {
  const pipelineInstance = await PipelineSingleton.getInstance(reportProgress);

  const output = await pipelineInstance(text, {
    pooling: "mean",
    normalize: true,
  });

  const embedding: Embedding = Array.from(output.data);
  return embedding;
};
