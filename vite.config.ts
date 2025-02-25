import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ["@electric-sql/pglite"],
  },
  build: {
    target: "esnext", // Add this line to support top-level await
    rollupOptions: {
      output: {
        format: "es",
      },
    },
  },
  worker: {
    format: "es",
  },
});
