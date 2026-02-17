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
//      every non-std module via EVMcrispr.registerModule().
// ---------------------------------------------------------------------------

const MODULE_PREFIX = "@evmcrispr/module-";
const VIRTUAL_ID = "virtual:evmcrispr-modules";
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;

function evmcrisprModules(modulesDir: string): Plugin {
  const aliases: Alias[] = [];
  const registrations: string[] = [];

  for (const dir of readdirSync(modulesDir)) {
    const pkgPath = path.resolve(modulesDir, dir, "package.json");
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const pkgName: string = pkg.name;
    if (!pkgName.startsWith(MODULE_PREFIX)) continue;

    // Alias: @evmcrispr/module-<name> -> modules/<name>/src/index.ts
    aliases.push({
      find: pkgName,
      replacement: path.resolve(modulesDir, dir, "src/index.ts"),
    });

    // Sub-path exports (e.g. @evmcrispr/module-aragonos/utils)
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

    // Registration (skip std -- it's always loaded)
    const name = pkgName.slice(MODULE_PREFIX.length);
    if (name !== "std") {
      registrations.push(
        `EVMcrispr.registerModule(${JSON.stringify(name)}, () => import(${JSON.stringify(pkgName)}), ${JSON.stringify(pkg.description ?? "")});`,
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
        'import { EVMcrispr } from "@evmcrispr/core";',
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
      "@evmcrispr/core": path.resolve(
        __dirname,
        "../../packages/core/src/index.ts",
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
