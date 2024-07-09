import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

export default {
  input: "src/main.ts",
  output: {
    dir: "dist",
    format: "es",
    inlineDynamicImports: true,
    banner: 'import { Buffer } from "node:buffer";',
  },
  plugins: [
    nodeResolve(), // Needed to bundle the assets from node_modules
    typescript(),
  ],
};
