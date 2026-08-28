import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { createRequire } from "node:module";
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
        `evml.use({ name: ${JSON.stringify(name)}, load: () => import(${JSON.stringify(pkgName)}), description: ${JSON.stringify(pkg.description ?? "")}, experimental: ${JSON.stringify(pkg.experimental === true)} });`,
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

// ---------------------------------------------------------------------------
// noir_wasm TDZ workaround
// ---------------------------------------------------------------------------
// j-toml (bundled inside @noir-lang/noir_wasm's webpack build) caches the
// global as `const Infinity = 1/0`. oxc's constant folding rewrites `1/0`
// into the identifier `Infinity`, which resolves to the const being
// declared — a self-referential initializer that throws "Cannot access 'j'
// before initialization" the moment the noir compiler chunk loads. The
// const has the same value as the global, and j-toml doesn't export it, so
// dropping the declaration lets references hit the global instead.
// ---------------------------------------------------------------------------

function fixNoirWasmInfinityTdz(): Plugin {
  const DECL = "const Infinity = 1/0;";
  return {
    name: "fix-noir-wasm-infinity-tdz",
    transform(code, id) {
      if (!id.includes("noir_wasm") || !code.includes(DECL)) return;
      return { code: code.replace(DECL, ""), map: null };
    },
  };
}

// ---------------------------------------------------------------------------
// Self-hosted Monaco assets
// ---------------------------------------------------------------------------
// The editor loads monaco's AMD build from `/vs` on our own origin instead
// of a third-party CDN — injected <script> tags can't be hash-verified, so
// the fix for CDN trust is not having a CDN. Dev serves straight out of the
// installed monaco-editor package (version-pinned and integrity-checked by
// the lockfile); build copies min/vs into the bundle output.
// ---------------------------------------------------------------------------

const MONACO_MIME: Record<string, string> = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".ttf": "font/ttf",
  ".json": "application/json",
};

function monacoAssets(): Plugin {
  const require = createRequire(import.meta.url);
  // monaco's exports map hides package.json; the "." require entry points
  // at min/vs/index.js, whose directory is the AMD build we serve.
  const vsDir = path.dirname(require.resolve("monaco-editor"));
  let copyTarget = "";
  return {
    name: "monaco-assets",
    configResolved(config) {
      copyTarget = path.join(
        path.resolve(config.root, config.build.outDir),
        "vs",
      );
    },
    configureServer(server) {
      server.middlewares.use("/vs", (req, res, next) => {
        const rel = path
          .normalize(decodeURIComponent((req.url ?? "/").split("?")[0]))
          .replace(/^[/\\]+/, "");
        const file = path.join(vsDir, rel);
        if (
          !file.startsWith(vsDir + path.sep) ||
          !existsSync(file) ||
          !statSync(file).isFile()
        ) {
          return next();
        }
        res.setHeader(
          "Content-Type",
          MONACO_MIME[path.extname(file)] ?? "application/octet-stream",
        );
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      if (copyTarget) cpSync(vsDir, copyTarget, { recursive: true });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  envDir: path.resolve(__dirname, "../.."),
  // PUBLIC_ vars are shared with the Astro website (same names, e.g.
  // PUBLIC_SITE_URL) so one deploy config serves both apps.
  envPrefix: ["VITE_", "PUBLIC_"],
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
      "@evmcrispr/ai": path.resolve(
        __dirname,
        "../../packages/ai/src/index.ts",
      ),
      // Sub-path exports before the base alias so they match first
      "@evmcrispr/core/worker-client": path.resolve(
        __dirname,
        "../../packages/core/src/worker/client.ts",
      ),
      "@evmcrispr/core/worker": path.resolve(
        __dirname,
        "../../packages/core/src/worker/expose.ts",
      ),
      "@evmcrispr/core": path.resolve(
        __dirname,
        "../../packages/core/src/index.ts",
      ),
      "@evmcrispr/modules/order": path.resolve(
        __dirname,
        "../../packages/modules/src/order.ts",
      ),
      "@evmcrispr/modules/chains": path.resolve(
        __dirname,
        "../../packages/modules/src/chains.ts",
      ),
      "@evmcrispr/sdk/onchain": path.resolve(
        __dirname,
        "../../packages/sdk/src/onchain/index.ts",
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
  optimizeDeps: {
    // The dev deps optimizer applies the same oxc constant folding as the
    // build but bypasses plugins, so fixNoirWasmInfinityTdz can't reach it —
    // serve noir_wasm's (self-contained) bundle as-is instead.
    exclude: ["@noir-lang/noir_wasm"],
  },
  plugins: [
    evmcrisprModules(path.resolve(__dirname, "../../modules")),
    fixNoirWasmInfinityTdz(),
    monacoAssets(),
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
    // Serve the static OAuth callback page at its extensionless registered
    // redirect URI (Vite's public-dir middleware doesn't resolve directory
    // indexes, so the request would otherwise fall through to the SPA).
    // Same treatment for the auth broker page (a real Vite entry, see
    // build.rollupOptions.input).
    {
      name: "nexus-auth-callback",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          const path = req.url?.split("?")[0].replace(/\/$/, "");
          if (path === "/auth/nexus/callback")
            req.url = "/auth/nexus/callback/index.html";
          else if (path === "/auth/nexus/broker")
            req.url = `/auth/nexus/broker/index.html${req.url?.includes("?") ? `?${req.url.split("?")[1]}` : ""}`;
          next();
        });
      },
    },
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      // Second HTML entry: the Nexus auth broker page other sites embed in
      // an iframe to run "Login with Dappnode Nexus" on this (allow-listed)
      // origin. See @evmcrispr/ai's nexus-broker module.
      input: {
        main: path.resolve(__dirname, "index.html"),
        "nexus-broker": path.resolve(__dirname, "auth/nexus/broker/index.html"),
      },
      // Externalize @metamask/sdk's uninstalled transitive browser deps.
      // cross-fetch does NOT belong here: WalletConnect's HTTP JSON-RPC
      // connection imports it for real, and externalizing left a bare
      // `import "cross-fetch"` in the bundle that the browser cannot resolve,
      // killing every WalletConnect session in production (dev ignores this
      // list, so it only ever failed in builds).
      external: ["eventemitter2", "socket.io-client"],
      output: {
        // Rolldown splits @noble/hashes and @noble/curves into separate
        // chunks with a circular dependency, causing sha256 to be undefined
        // when secp256k1 initialises at module evaluation time.
        // See: https://github.com/rolldown/rolldown/issues/9225
        manualChunks(id) {
          if (id.includes("@noble/hashes") || id.includes("@noble/curves")) {
            return "noble-crypto";
          }
          // Keep sdk+core in a single chunk. Rolldown otherwise extracts
          // shared sdk utils into chunks alongside lazy-loaded module code
          // (e.g. aragonos), producing circular chunks whose partial
          // initialization leaves namespaces like BindingsSpace undefined
          // at load (blank terminal). Same bug class as rolldown#9225.
          if (
            id.includes("packages/sdk/src") ||
            id.includes("packages/core/src")
          ) {
            return "evmcrispr";
          }
        },
      },
    },
  },
  worker: {
    // The module registrations are dynamic imports; the default iife
    // format forbids code splitting.
    format: "es",
    // Worker builds get their own plugin pipeline — the virtual
    // `virtual:evmcrispr-modules` module must resolve there too (aliases
    // are shared via the root `resolve` config).
    plugins: () => [
      evmcrisprModules(path.resolve(__dirname, "../../modules")),
      fixNoirWasmInfinityTdz(),
    ],
    rollupOptions: {
      output: {
        // Same rolldown circular-chunk workaround as the main build.
        manualChunks(id) {
          if (id.includes("@noble/hashes") || id.includes("@noble/curves")) {
            return "noble-crypto";
          }
          // Keep sdk+core in a single chunk. Rolldown otherwise extracts
          // shared sdk utils into chunks alongside lazy-loaded module code
          // (e.g. aragonos), producing circular chunks whose partial
          // initialization leaves namespaces like BindingsSpace undefined
          // at load (blank terminal). Same bug class as rolldown#9225.
          if (
            id.includes("packages/sdk/src") ||
            id.includes("packages/core/src")
          ) {
            return "evmcrispr";
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
