import { useState, useEffect, useRef } from "react";
import {
  contentTypes,
  EmbeddingRow,
  RecordType,
  WorkerMessage,
} from "./types.ts";
import {
  Container,
  TextField,
  Button,
  Typography,
  Card,
  CardContent,
  Grid2 as Grid,
  CssBaseline,
  ThemeProvider,
  createTheme,
  LinearProgress,
  Box,
  CardActions,
  CardActionArea,
  Backdrop,
  CircularProgress,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import { Masonry } from "@mui/lab";

const darkTheme = createTheme({
  palette: {
    mode: "dark",
  },
});

export default function App() {
  const [input, setInput] = useState("");
  const [searchTypes, setSearchTypes] = useState(contentTypes);
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [results, setResults] = useState<EmbeddingRow[]>([]);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [loadingDb, setLoadingDb] = useState(true);
  const [loadingSearch, setLoadingSearch] = useState(false);
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
        setLoadingDb(false);
        break;
      }
      case WorkerMessage.SEARCH_RESULTS: {
        setLoadingSearch(false);
        setResults(e.data.searchResults);
        break;
      }
      case WorkerMessage.DB_READY: {
        setLoadingDb(false);
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

  const search = async (text: string, types?: RecordType[]) => {
    if (worker.current) {
      setLoadingSearch(true);
      worker.current.postMessage({
        cmd: WorkerMessage.SEARCH,
        text,
        searchTypes: types || searchTypes,
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

  const iframeSrcOwid = iframeSrc?.replace(
    /^https?:\/\/[^/]+/,
    "https://ourworldindata.org"
  );

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Backdrop
        sx={(theme) => ({ color: "#fff", zIndex: theme.zIndex.drawer + 1 })}
        open={loadingDb}
      >
        <CircularProgress color="inherit" />
      </Backdrop>
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
                disabled={loadingDb}
                onChange={(e) => {
                  setInput(e.target.value);
                }}
                value={input}
              />
            </Grid>
            <Grid size={3}>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                fullWidth
                loading={loadingSearch}
              >
                Semantic Search
              </Button>
            </Grid>
          </Grid>
        </form>
        <ToggleButtonGroup
          value={searchTypes}
          onChange={(_, types) => {
            console.log("types", types);
            setSearchTypes(types);
            search(input, types);
          }}
          aria-label="search types"
          size="small"
        >
          <ToggleButton value="chart">Charts</ToggleButton>
          <ToggleButton value="insight">Insights</ToggleButton>
          <ToggleButton value="gdoc">Articles</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ mt: 4 }}>
          {iframeSrcOwid && (
            <iframe
              src={iframeSrcOwid}
              style={{
                width: "100%",
                height: "600px",
                border: "none",
                marginBottom: "20px",
              }}
            />
          )}
          <Masonry columns={3} spacing={2}>
            {results.map((item) => (
              <Card key={item.loc || item.title}>
                <CardActionArea
                  onClick={() => {
                    setInput(item.title);
                    search(item.title);
                    setIframeSrc(null);
                  }}
                >
                  <CardContent>
                    <Typography lineHeight={1.2} variant="h6" gutterBottom>
                      {item.title}
                    </Typography>
                    <Typography>{item.content}</Typography>
                  </CardContent>
                </CardActionArea>
                {item.type === "chart" && (
                  <CardActions>
                    <Button
                      size="small"
                      onClick={() => {
                        setIframeSrc(item.loc);
                      }}
                      // startIcon={<ShowChart />}
                    >
                      View chart
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        setIframeSrc(
                          item.loc ? item.loc.concat("?tab=table") : null
                        );
                      }}
                      // startIcon={<TableChart />}
                    >
                      View data
                    </Button>
                  </CardActions>
                )}
              </Card>
            ))}
          </Masonry>
        </Box>
        <Box sx={{ mt: 4 }}>
          <Button
            variant="contained"
            color="secondary"
            fullWidth
            sx={{ mb: 2 }}
            onClick={() => {
              if (!worker.current) return;
              setLoadingDb(true);
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
