import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { type Alias, defineConfig, type Plugin } from "vite";

// ---------------------------------------------------------------------------
// EVMcrispr module auto-discovery plugin
// ---------------------------------------------------------------------------
// Scans the modules/ directory once and:
//   1. Injects Vite aliases for every @evmcrispr/module-* package (incl.
//      sub-path exports) so imports resolve to source files.
//   2. Provides a `virtual:evmcrispr-modules` virtual module that registers
//      every non-std module via evml.use().
// ---------------------------------------------------------------------------

const MODULE_PREFIX = "@evmcrispr/module-";
const VIRTUAL_ID = "virtual:evmcrispr-modules";
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;

function evmcrisprModules(modulesDir: string): Plugin {
  const aliases: Alias[] = [];
  const registrations: string[] = [];

  for (const dir of readdirSync(modulesDir).sort()) {
    const pkgPath = path.resolve(modulesDir, dir, "package.json");
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const pkgName: string = pkg.name;
    if (!pkgName.startsWith(MODULE_PREFIX)) continue;

    // Sub-path exports first so they match before the base package alias
    // (e.g. @evmcrispr/module-aragonos/utils before @evmcrispr/module-aragonos)
    if (pkg.exports) {
      for (const [key, val] of Object.entries(pkg.exports)) {
        if (key === ".") continue;
        const bunEntry = (val as any).bun;
        if (bunEntry) {
          aliases.push({
            find: `${pkgName}${key.slice(1)}`,
            replacement: path.resolve(modulesDir, dir, bunEntry),
          });
        }
      }
    }

    // Alias: @evmcrispr/module-<name> -> modules/<name>/src/index.ts
    aliases.push({
      find: pkgName,
      replacement: path.resolve(modulesDir, dir, "src/index.ts"),
    });

    // Registration (skip std -- it's always loaded)
    const name = pkgName.slice(MODULE_PREFIX.length);
    if (name !== "std") {
      registrations.push(
        `evml.use({ name: ${JSON.stringify(name)}, load: () => import(${JSON.stringify(pkgName)}), description: ${JSON.stringify(pkg.description ?? "")} });`,
      );
    }
  }

  return {
    name: "evmcrispr-modules",
    config() {
      return { resolve: { alias: aliases } };
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return;
      return [
        'import { evml } from "@evmcrispr/core";',
        "",
        ...registrations,
      ].join("\n");
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  envDir: path.resolve(__dirname, "../.."),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@evmcrispr/core/package.json": path.resolve(
        __dirname,
        "../../packages/core/package.json",
      ),
      "@evmcrispr/editor/styles/components.css": path.resolve(
        __dirname,
        "../../packages/editor/src/styles/components.css",
      ),
      "@evmcrispr/editor/monaco": path.resolve(
        __dirname,
        "../../packages/editor/src/editor/MonacoEditor.tsx",
      ),
      "@evmcrispr/editor": path.resolve(
        __dirname,
        "../../packages/editor/src/index.ts",
      ),
      "@evmcrispr/core": path.resolve(
        __dirname,
        "../../packages/core/src/index.ts",
      ),
      "@evmcrispr/modules/order": path.resolve(
        __dirname,
        "../../packages/modules/src/order.ts",
      ),
      "@evmcrispr/sdk": path.resolve(
        __dirname,
        "../../packages/sdk/src/index.ts",
      ),
    },
  },
  define: {
    global: "globalThis",
  },
  plugins: [
    evmcrisprModules(path.resolve(__dirname, "../../modules")),
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
    // arcsecond's entry has a dead `require('util')` fallback for environments
    // without a global TextEncoder. Browsers always have one, but Vite still
    // warns about externalizing the node builtin. Resolve `util` to a stub
    // when imported from arcsecond.
    {
      name: "stub-util-in-arcsecond",
      enforce: "pre",
      resolveId(id, importer) {
        if (id === "util" && importer?.includes("/arcsecond/")) {
          return "\0arcsecond-util-stub";
        }
      },
      load(id) {
        if (id === "\0arcsecond-util-stub") {
          return "export const TextEncoder = globalThis.TextEncoder; export const TextDecoder = globalThis.TextDecoder;";
        }
      },
    },
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      // Externalize @metamask/sdk's unresolvable transitive browser deps
      external: ["eventemitter2", "cross-fetch", "socket.io-client"],
      output: {
        // Rolldown splits @noble/hashes and @noble/curves into separate
        // chunks with a circular dependency, causing sha256 to be undefined
        // when secp256k1 initialises at module evaluation time.
        // See: https://github.com/rolldown/rolldown/issues/9225
        manualChunks(id) {
          if (id.includes("@noble/hashes") || id.includes("@noble/curves")) {
            return "noble-crypto";
          }
        },
      },
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
