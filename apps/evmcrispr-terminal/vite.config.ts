import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@1hive/evmcrispr": path.resolve(__dirname, "../../packages/evmcrispr"),
    },
  },
  define: {
    global: "globalThis",
  },
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ["@metamask/sdk"],
  },
  build: {
    rollupOptions: {
      // Externalize @metamask/sdk's unresolvable transitive browser deps
      external: ["eventemitter2", "cross-fetch", "socket.io-client"],
    },
  },
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
