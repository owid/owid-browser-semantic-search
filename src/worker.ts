import {
  FeatureExtractionPipeline,
  pipeline,
  ProgressCallback,
  ProgressInfo,
} from "@huggingface/transformers";
import { getDb, initSchema, insertEmbeddingsBatch } from "./utils/db";
import {
  Embedding,
  EmbeddingRow,
  parseCoredumpJson,
  WorkerMessage,
} from "./types";

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

const reportProgress = (info: ProgressInfo) => {
  // We add a progress callback to the pipeline so that we can
  // track model loading.
  self.postMessage({ status: WorkerMessage.PROGRESS, progress: info });
};

const generateEmbeddingsForItems = async () => {
  console.log("Generating embeddings for items");

  const response = await fetch("http://localhost:5173/coredump.json");
  const coredumpItems = parseCoredumpJson(await response.json());

  const items = coredumpItems; /*.slice(0, 500);*/

  const db = await getDb("worker"); // Initialize the database
  await initSchema(db); // Ensure the schema is initialized

  const batchSize = 100;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results: EmbeddingRow[] = [];
    for (const item of batch) {
      // Get the embedding output from the pipeline.
      const embedding = await getEmbeddingFor(item.title);

      results.push({ ...item, embedding });
    }

    console.log(
      `Inserting batch ${i / batchSize + 1} of ${Math.ceil(
        items.length / batchSize
      )}`
    );

    await insertEmbeddingsBatch(db, results);
    console.log(`Batch ${i / batchSize + 1} inserted successfully`);
  }
};

// Listen for messages to start generating embeddings.
self.addEventListener("message", async (event) => {
  console.log("Worker embeddings received message:", event.data);
  switch (event.data.cmd) {
    case WorkerMessage.GENERATE_EMBEDDINGS:
      await generateEmbeddingsForItems();
      self.postMessage({ status: WorkerMessage.EMBEDDINGS_GENERATED });
      break;
    case WorkerMessage.REQUEST_EMBEDDING: {
      const embedding = await getEmbeddingFor(event.data.text);
      self.postMessage({ status: WorkerMessage.RETURN_EMBEDDING, embedding });
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
