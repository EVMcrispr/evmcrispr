// tsup.config.ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/std/index.ts"], // Adjust the entry point as needed
  splitting: true, // Enable code splitting
  format: ["esm", "cjs"], // Output format
  outDir: "dist", // Output directory
  dts: true, // Generate TypeScript declaration files
  sourcemap: true, // Generate source maps
  clean: true, // Clean the output directory before building
});
