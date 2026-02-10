import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@evmcrispr/core/package.json": path.resolve(
        __dirname,
        "../../packages/evmcrispr/package.json",
      ),
      "@evmcrispr/core": path.resolve(
        __dirname,
        "../../packages/evmcrispr/src/index.ts",
      ),
    },
  },
  define: {
    global: "globalThis",
  },
  plugins: [
    // Stub out @metamask/sdk – wagmi dynamically imports it inside a
    // try/catch for the MetaMask connector, but we don't use that connector
    // and the package isn't installed.
    {
      name: "stub-metamask-sdk",
      resolveId(id) {
        if (id === "@metamask/sdk") return "\0metamask-sdk-stub";
      },
      load(id) {
        if (id === "\0metamask-sdk-stub") return "export default {};";
      },
    },
    react(),
    tailwindcss(),
  ],
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
