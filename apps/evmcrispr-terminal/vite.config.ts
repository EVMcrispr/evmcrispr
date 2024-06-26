import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      "@1hive/evmcrispr": path.resolve(__dirname, "../../packages/evmcrispr"),
    },
  },
  define: {
    global: "globalThis",
  },
  plugins: [react()],
  server: {
    port: 3000,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
      "Access-Control-Allow-Headers":
        "X-Requested-With, content-type, Authorization",
    },
  },
});
