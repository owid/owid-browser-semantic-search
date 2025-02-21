import { useState, useEffect, useRef } from "react";
import { RecordType, WorkerMessage, RowMetadata } from "./types.ts";
import { CONTENT_TYPES, SIMILARITY_THRESHOLD } from "./constants.ts";
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
  Slider,
} from "@mui/material";
import { Masonry } from "@mui/lab";
import SlickSlider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import "./styles.css";
import {
  urlToOwid,
  groupChartsByTitle,
  isNotNullOrUndefined,
} from "./utils/utils";

const darkTheme = createTheme({
  palette: {
    mode: "dark",
  },
});

export default function App() {
  const [input, setInput] = useState("");
  const [searchTypes, setSearchTypes] = useState<RecordType[]>(CONTENT_TYPES);
  const [iframeSrcs, setIframeSrcs] = useState<string[]>([]);
  const [results, setResults] = useState<RowMetadata[]>([]);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [loadingDb, setLoadingDb] = useState(true);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [dbStats, setDbStats] = useState<{ type: RecordType; count: number }[]>(
    []
  );
  const [similarityThreshold, setSimilarityThreshold] = useState(0.8);

  const marks = [
    {
      value: SIMILARITY_THRESHOLD - 0.5,
      label: "different",
    },
    {
      value: SIMILARITY_THRESHOLD + 0.5,
      label: "similar",
    },
  ];

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

  const search = async ({
    text = input,
    types = searchTypes,
    threshold = similarityThreshold,
  }: {
    text?: string;
    types?: RecordType[];
    threshold?: number;
  }) => {
    if (worker.current) {
      setLoadingSearch(true);
      setIframeSrcs([]);
      worker.current.postMessage({
        cmd: WorkerMessage.SEARCH,
        text,
        searchTypes: types,
        similarityThreshold: threshold,
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

  const groupedResults = groupChartsByTitle(results);

  const sliderSettings = {
    infinite: false,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    centerPadding: "60px",
  };

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
            search({ text: input });
          }}
        >
          <Grid container spacing={2} alignItems="center">
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

          <Box sx={{ mt: 2, mb: 2 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid size={4}>
                <ToggleButtonGroup
                  value={searchTypes}
                  onChange={(_, types) => {
                    setSearchTypes(types);
                  }}
                  aria-label="search types"
                  size="small"
                >
                  <ToggleButton value="chart">Charts</ToggleButton>
                  <ToggleButton value="insight">Insights</ToggleButton>
                  <ToggleButton value="gdoc">Articles</ToggleButton>
                </ToggleButtonGroup>
              </Grid>
              <Grid size={4}>
                <Slider
                  value={similarityThreshold}
                  min={0.7}
                  max={0.8}
                  step={0.01}
                  marks={marks}
                  track={
                    similarityThreshold < SIMILARITY_THRESHOLD
                      ? "normal"
                      : "inverted"
                  }
                  onChange={(_, value) => {
                    setSimilarityThreshold(value as number);
                  }}
                  valueLabelDisplay="auto"
                />
              </Grid>
              <Grid size={3} offset="auto">
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  fullWidth
                  loading={loadingSearch}
                  disabled={input.length === 0}
                >
                  {SIMILARITY_THRESHOLD > similarityThreshold
                    ? "Find Different"
                    : "Find Similar"}
                </Button>
              </Grid>
            </Grid>
          </Box>
        </form>
        <Box sx={{ mt: 2, mb: 2 }}>
          {iframeSrcs && (
            <SlickSlider {...sliderSettings}>
              {iframeSrcs.map((src, i) => (
                <iframe
                  key={`${src}-${i}`}
                  src={src}
                  className="chart-iframe"
                />
              ))}
            </SlickSlider>
          )}
        </Box>
        <Masonry columns={3} spacing={2}>
          {groupedResults.map(({ title, type, content, locs }) => (
            <Card key={`${title}-${type}`}>
              <CardActionArea
                onClick={() => {
                  if (title !== input) {
                    search({ text: title });
                    setInput(title);
                  }
                }}
              >
                <CardContent>
                  <Typography lineHeight={1.2} variant="h6" gutterBottom>
                    {title}
                  </Typography>
                  <Typography>{content}</Typography>
                </CardContent>
              </CardActionArea>
              {type === "chart" && (
                <CardActions>
                  <Button
                    size="small"
                    onClick={() => {
                      setIframeSrcs(
                        locs.filter(isNotNullOrUndefined).map(urlToOwid)
                      );
                    }}
                  >
                    {locs.length > 1 ? "View chart collection" : "View chart"}
                  </Button>
                </CardActions>
              )}
            </Card>
          ))}
          {groupedResults.length > 0 && (
            <Card>
              <CardContent>
                <Button
                  fullWidth
                  variant="contained"
                  color="primary"
                  onClick={() => {
                    setInput("");
                    search({ text: groupedResults[0].title, threshold: 0.7 });
                  }}
                >
                  Something different?
                </Button>
              </CardContent>
            </Card>
          )}
        </Masonry>

        <Box sx={{ mt: 4 }}>
          <Grid container justifyContent="center">
            <Grid size={4}>
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
            </Grid>
          </Grid>
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
