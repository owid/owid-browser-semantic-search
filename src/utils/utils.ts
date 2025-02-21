import { RowMetadata, RowMetadataMultipleLoc } from "../types";

// Function to convert URL to OWID format
export const urlToOwid = (url: string): string => {
  return url.replace(/^https?:\/\/[^/]+/, "https://ourworldindata.org");
};

// Function to group charts by title
export const groupChartsByTitle = (
  results: RowMetadata[]
): RowMetadataMultipleLoc[] => {
  return results.reduce((acc: RowMetadataMultipleLoc[], item) => {
    if (item.type === "chart") {
      const existingChart = acc.find(
        (x) => x.title === item.title && x.type === "chart"
      );
      if (existingChart) {
        existingChart.locs.push(item.loc);
        return acc;
      }
    }
    acc.push({ ...item, locs: [item.loc] });
    return acc;
  }, []);
};

// Function to check if a value is not null or undefined
export const isNotNullOrUndefined = (value: string | null): value is string => {
  return value !== null && value !== undefined;
};
