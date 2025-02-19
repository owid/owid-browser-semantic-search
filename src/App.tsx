import { useState, useEffect, useRef } from "react";
import { EmbeddingRow, RecordType, WorkerMessage } from "./types.ts";
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
  LinearProgress,
  Box,
} from "@mui/material";
import { Masonry } from "@mui/lab";

const darkTheme = createTheme({
  palette: {
    mode: "dark",
  },
});

const defaultResults: EmbeddingRow[] = [
  {
    title: "Loading...",
    type: "chart",
    loc: "#",
    content: "Please wait...",
    lastmod: null,
    embedding: [],
  },
];

export default function App() {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<EmbeddingRow[]>(defaultResults);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [dbStats, setDbStats] = useState<{ type: RecordType; count: number }[]>(
    []
  );

  // Create a reference to the worker object.
  const worker = useRef<Worker>(null);

  // Create a callback function for messages from the worker thread.
  const onMessageReceived = async (e: MessageEvent) => {
    switch (e.data.status) {
      case WorkerMessage.PROGRESS_MODEL:
        // setProgressModel(e.data.progress);
        if (e.data.progress.ready) {
          console.log("Progress is ready:", e.data.progress);
        }
        break;
      case WorkerMessage.PROGRESS: {
        setProgress(e.data.progress);
        break;
      }
      case WorkerMessage.EMBEDDINGS_GENERATED: {
        setProgress(null);
        setLoading(false);
        break;
      }
      case WorkerMessage.SEARCH_RESULTS: {
        setLoading(false);
        setResults(e.data.searchResults);
        break;
      }
      case WorkerMessage.DB_READY: {
        setLoading(false);
        break;
      }
      case WorkerMessage.DB_STATS: {
        setDbStats(e.data.dbStats);
        break;
      }
      default:
        console.warn("Unknown message status:", e.data.status);
    }
  };

  const search = async (text: string) => {
    if (worker.current) {
      setLoading(true);
      worker.current.postMessage({
        cmd: WorkerMessage.SEARCH,
        text,
      });
    }
  };

  useEffect(() => {
    // Set up worker
    worker.current = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
    // Attach the callback functions as an event listener.
    worker.current.addEventListener("message", onMessageReceived);

    // todo : move this to a button
    // worker.current.postMessage({
    //   cmd: WorkerMessage.DB_STATS,
    // });

    return () => {
      if (worker.current) {
        worker.current.removeEventListener("message", onMessageReceived);
      }
    };
  }, []);

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            search(input);
          }}
        >
          <Grid container spacing={2} alignItems="center">
            <Grid size={9}>
              <TextField
                fullWidth
                variant="outlined"
                margin="normal"
                placeholder="Enter text here"
                disabled={loading}
                onChange={(e) => {
                  setInput(e.target.value);
                }}
              />
            </Grid>
            <Grid size={3}>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                fullWidth
                loading={loading}
              >
                Semantic Search
              </Button>
            </Grid>
          </Grid>
        </form>
        <Box sx={{ mt: 4 }}>
          <Masonry columns={3} spacing={2}>
            {results.map((item) => (
              <Link
                href={item.loc || "#"}
                color="inherit"
                underline="none"
                key={item.loc || item.title}
                sx={{ display: "block" }}
              >
                <Card>
                  <CardContent>
                    <Typography variant="h6">{item.title}</Typography>
                    <Typography color="textSecondary">{item.type}</Typography>
                    <Typography>{item.content}</Typography>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </Masonry>
        </Box>
        <Box sx={{ mt: 4 }}>
          <Button
            variant="contained"
            color="secondary"
            fullWidth
            loading={loading}
            sx={{ mb: 2 }}
            onClick={() => {
              if (!worker.current) return;
              setLoading(true);
              worker.current.postMessage({
                cmd: WorkerMessage.GENERATE_EMBEDDINGS,
              });
            }}
          >
            Regenerate Embeddings
          </Button>
        </Box>
        {/* {progressModel && (
          <Typography align="center">
            Model Loading Progress: {JSON.stringify(progressModel)}
          </Typography>
        )} */}
        {progress && (
          <Box sx={{ width: "100%", mb: 2 }}>
            <LinearProgress
              variant="determinate"
              value={(progress.current / progress.total) * 100}
            />
            <Typography align="center">
              Embedding Generation Progress: {progress.current} /{" "}
              {progress.total}
            </Typography>
          </Box>
        )}
        {dbStats.length > 0 && (
          <Box sx={{ width: "100%", mb: 2 }}>
            <Typography variant="h6">Database Statistics:</Typography>
            {dbStats.map((stat, index) => (
              <Typography key={index}>
                {stat.type}: {stat.count}
              </Typography>
            ))}
          </Box>
        )}
      </Container>
    </ThemeProvider>
  );
}
