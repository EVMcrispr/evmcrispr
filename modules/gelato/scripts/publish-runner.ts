/**
 * Build the EVML runner Web3 Function and publish it to Gelato's function
 * store, pinning the resulting CID in src/runner/published.ts.
 *
 *   bun run publish-runner              # build, upload, rewrite published.ts
 *   bun run publish-runner --dry-run    # build and report sizes only
 *   bun run publish-runner --out <file> # also write the bundle (Deno smoke)
 *   bun run publish-runner --retry 30   # keep retrying a 503 store for 30 min
 *
 * The bundle is a single browser-flavoured ESM file: core + sdk + std +
 * every module except the ones the sandbox cannot run (RUNNER_EXCLUDED_MODULES),
 * built from workspace sources with Bun.build. The build is deterministic,
 * so anyone rebuilding the same sources gets the same CID.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RUNNER_EXCLUDED_MODULES, RUNNER_SCHEMA } from "../src/runner/schema";
import { MAX_BUNDLE_BYTES, packWeb3Function } from "../src/utils/tgz";
import { uploadWeb3Function } from "../src/utils/upload";

const here = dirname(fileURLToPath(import.meta.url));
const gelatoDir = join(here, "..");
const entry = join(gelatoDir, "src/runner/index.ts");
const publishedFile = join(gelatoDir, "src/runner/published.ts");

export interface RunnerBuild {
  indexJs: string;
  sourceJs: string;
  tgz: Uint8Array;
  sha256: string;
  /** Bytes each bundled package contributes (unminified inputs). */
  packages: Record<string, number>;
}

const excludedModules = new RegExp(
  `^@evmcrispr/module-(${RUNNER_EXCLUDED_MODULES.join("|")})$`,
);

/**
 * Runs before anything else in the bundle. Gelato's sandbox is Deno with
 * env access limited to two variables, and Deno's Node-compat
 * `process.env.X` THROWS (NotCapable) for any other name instead of
 * returning undefined. The sdk guards its env reads with
 * `typeof process !== "undefined"`, true under Deno, so a plain object
 * stands in for `process`: every env read is undefined and every
 * `process.versions.node` check takes the browser path — except the
 * experimental flag, set so every command and helper the bundle ships is
 * usable (gating experimental ones is a terminal concern).
 */
const PROCESS_SHIM = `try{Object.defineProperty(globalThis,"process",{value:{env:{VITE_PUBLIC_EXPERIMENTAL:"true"},versions:{}},configurable:true,writable:true})}catch{}`;

const nodeBuiltins =
  /^(node:.*|crypto|buffer|util|stream|events|fs|path|os|module)$/;

const stubs: Bun.BunPlugin = {
  name: "evmcrispr-runner-stubs",
  setup(build) {
    // Modules the runner does not ship, and the Node-only paths some kept
    // modules import lazily (solc via node:module): never loaded at runtime.
    build.onResolve({ filter: excludedModules }, (args) => ({
      path: args.path,
      namespace: "stub",
    }));
    // Node builtins: `node:` imports from kept modules' lazy Node paths, and
    // the bare `crypto`/`buffer`/`util` that brorand, bn.js and arcsecond
    // probe inside try/catch before falling back to Web APIs.
    build.onResolve({ filter: nodeBuiltins }, (args) => ({
      path: args.path,
      namespace: "stub",
    }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: "export default {};",
      loader: "js",
    }));
  },
};

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildRunner(): Promise<RunnerBuild> {
  const result = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    format: "esm",
    minify: true,
    conditions: ["bun"],
    plugins: [stubs],
    banner: PROCESS_SHIM,
    metafile: true,
  } as Bun.BuildConfig);
  if (!result.success) {
    throw new Error(
      `runner build failed:\n${result.logs.map((l) => l.message).join("\n")}`,
    );
  }
  const output = result.outputs.find((o) => o.kind === "entry-point");
  if (!output) throw new Error("runner build produced no entry point");
  const indexJs = await output.text();

  const packages: Record<string, number> = {};
  const meta = (
    result as unknown as {
      metafile?: { inputs: Record<string, { bytes: number }> };
    }
  ).metafile;
  if (meta) {
    for (const [path, { bytes }] of Object.entries(meta.inputs)) {
      const m = path.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/g);
      const pkg = m
        ? m[m.length - 1].replace("node_modules/", "")
        : path
            .replace(/^.*?(packages|modules)\//, "$1/")
            .split("/")
            .slice(0, 2)
            .join("/");
      packages[pkg] = (packages[pkg] ?? 0) + bytes;
    }
  }

  const sourceJs = new Bun.Transpiler({ loader: "ts" }).transformSync(
    await Bun.file(entry).text(),
  );
  const tgz = await packWeb3Function({
    indexJs,
    sourceJs,
    schema: RUNNER_SCHEMA,
  });
  return { indexJs, sourceJs, tgz, sha256: await sha256Hex(tgz), packages };
}

function report(build: RunnerBuild) {
  const gz = build.tgz.length;
  console.log(
    `bundle ${(build.indexJs.length / 1024).toFixed(0)} KiB minified, archive ${(gz / 1024).toFixed(0)} KiB (limit ${MAX_BUNDLE_BYTES / 1024} KiB) sha256 ${build.sha256.slice(0, 16)}…`,
  );
  const top = Object.entries(build.packages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  for (const [pkg, bytes] of top) {
    console.log(`  ${(bytes / 1024).toFixed(0).padStart(6)} KiB  ${pkg}`);
  }
}

async function publishedValues() {
  const mod = await import(publishedFile);
  return mod as { RUNNER_CID: string; RUNNER_SHA256: string };
}

async function writePublished(fields: {
  cid: string;
  sha256: string;
  version: string;
  bytes: number;
}) {
  const current = await Bun.file(publishedFile).text();
  const next = current
    .replace(
      /export const RUNNER_CID = "[^"]*";/,
      `export const RUNNER_CID = "${fields.cid}";`,
    )
    .replace(
      /export const RUNNER_SHA256 = "[^"]*";/,
      `export const RUNNER_SHA256 = "${fields.sha256}";`,
    )
    .replace(
      /export const RUNNER_VERSION = "[^"]*";/,
      `export const RUNNER_VERSION = "${fields.version}";`,
    )
    .replace(
      /export const RUNNER_BUNDLE_BYTES = \d+;/,
      `export const RUNNER_BUNDLE_BYTES = ${fields.bytes};`,
    );
  await Bun.write(publishedFile, next);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const outIndex = args.indexOf("--out");
  const out = outIndex >= 0 ? args[outIndex + 1] : undefined;

  const build = await buildRunner();
  report(build);
  if (out) {
    await Bun.write(out, build.indexJs);
    console.log(`bundle written to ${out}`);
  }
  if (build.tgz.length > MAX_BUNDLE_BYTES) {
    console.error("archive exceeds Gelato's 1 MiB limit");
    process.exit(1);
  }
  const again = await buildRunner();
  if (again.sha256 !== build.sha256) {
    console.error("build is not deterministic: two builds differ");
    process.exit(1);
  }
  if (dryRun) process.exit(0);

  const version = (await Bun.file(join(gelatoDir, "package.json")).json())
    .version as string;
  const published = await publishedValues();
  if (published.RUNNER_SHA256 === build.sha256 && published.RUNNER_CID) {
    console.log(`unchanged: ${published.RUNNER_CID} already holds these bytes`);
    await writePublished({
      cid: published.RUNNER_CID,
      sha256: build.sha256,
      version,
      bytes: build.tgz.length,
    });
    process.exit(0);
  }
  const retryIndex = args.indexOf("--retry");
  const retryMinutes = retryIndex >= 0 ? Number(args[retryIndex + 1]) : 0;
  const deadline = Date.now() + retryMinutes * 60_000;
  let cid: string;
  for (;;) {
    try {
      cid = await uploadWeb3Function(build.tgz, "EVMcrispr EVML runner");
      break;
    } catch (err) {
      // The store drops requests wholesale when overloaded (503), at times
      // for hours; with --retry, wait it out.
      const message = (err as Error).message;
      const outage = /503|couldn't reach/.test(message);
      if (!outage || Date.now() >= deadline) throw err;
      console.log(`${message} — retrying in 60s`);
      await Bun.sleep(60_000);
    }
  }
  await writePublished({
    cid,
    sha256: build.sha256,
    version,
    bytes: build.tgz.length,
  });
  console.log(
    `published ${cid} (${build.tgz.length} bytes), pinned in src/runner/published.ts`,
  );
}
