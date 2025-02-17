import { PGlite } from "@electric-sql/pglite";
import { countRows, getDb as getDb, initSchema, search } from "./utils/db.ts";
import { useState, useEffect, useRef } from "react";
import { EmbeddingRow, WorkerMessage } from "./types.ts";
import {
  Container,
  TextField,
  Button,
  Typography,
  Card,
  CardContent,
  Link,
  Grid2 as Grid,
  CssBaseline,
  ThemeProvider,
  createTheme,
} from "@mui/material";

const darkTheme = createTheme({
  palette: {
    mode: "dark",
  },
});

export default function App() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<EmbeddingRow[]>([]);
  const [progress, setProgress] = useState(null);
  const initializing = useRef(false);

  // Create a reference to the worker object.
  const worker = useRef<Worker>(null);

  // Set up DB
  const db = useRef<PGlite>(null);

  // Create a callback function for messages from the worker thread.
  const onMessageReceived = async (e: MessageEvent) => {
    switch (e.data.status) {
      case WorkerMessage.PROGRESS:
        setProgress(e.data.progress);
        break;
      case WorkerMessage.EMBEDDINGS_GENERATED:
        setProgress(null); // Reset progress after completion
        break;
      case WorkerMessage.RETURN_EMBEDDING: {
        console.log("returning embedding", e.data.embedding);
        // Cosine similarity search in pgvector
        if (!db.current) return;
        console.log("Searching for similar embeddings");
        const searchResults = await search(db.current, e.data.embedding);
        setResult(searchResults);
        break;
      }
      default:
        console.warn("Unknown message status:", e.data.status);
    }
  };

  const requestEmbedding = (text: string) => {
    if (worker.current) {
      worker.current.postMessage({
        cmd: WorkerMessage.REQUEST_EMBEDDING,
        text,
      });
    }
  };

  useEffect(() => {
    const setupDb = async () => {
      initializing.current = true;
      db.current = await getDb();
      await initSchema(db.current);
      // count rows
      const count = await countRows(db.current, "embeddings");
      console.log(`Total rows in the database: ${count}`);
    };
    if (!initializing.current) setupDb();

    // Set up worker
    worker.current = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
    // Attach the callback functions as an event listener.
    worker.current.addEventListener("message", onMessageReceived);

    return () => {
      if (worker.current) {
        worker.current.removeEventListener("message", onMessageReceived);
      }
    };
  }, []);

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Container maxWidth="md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            requestEmbedding(input);
          }}
        >
          <TextField
            fullWidth
            variant="outlined"
            margin="normal"
            placeholder="Enter text here"
            onChange={(e) => {
              setResult([]);
              setInput(e.target.value);
            }}
          />
          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            sx={{ mb: 2 }}
          >
            Semantic Search
          </Button>
        </form>
        <Button
          variant="contained"
          color="secondary"
          fullWidth
          sx={{ mb: 2 }}
          onClick={() => {
            if (!worker.current || !db.current) return;
            db.current.query("DELETE FROM embeddings");
            worker.current.postMessage({
              cmd: WorkerMessage.GENERATE_EMBEDDINGS,
            });
          }}
        >
          Regenerate Embeddings
        </Button>
        {progress && (
          <Typography align="center">
            Progress: {JSON.stringify(progress)}
          </Typography>
        )}
        <Typography align="center" variant="h6" gutterBottom>
          Similarity Search results:
        </Typography>
        <Grid container spacing={2}>
          {result.map((item, index) => (
            <Grid size={4} key={index}>
              <Card>
                <CardContent>
                  <Typography variant="h6">{item.title}</Typography>
                  <Typography color="textSecondary">{item.type}</Typography>
                  <Typography>{item.content}</Typography>
                  {item.loc && (
                    <Link href={item.loc} color="primary">
                      {item.loc}
                    </Link>
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>
    </ThemeProvider>
  );
}
