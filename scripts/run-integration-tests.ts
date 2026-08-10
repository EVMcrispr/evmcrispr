#!/usr/bin/env bun
/**
 * Integration test runner script
 * Starts Anvil, runs integration tests sequentially for each module, then stops Anvil.
 * This ensures tests don't run in parallel against the same Anvil instance.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import {
  ANVIL_PORT_ENV,
  acquireAnvilPort,
  ensureAnvil,
  getEndpoint,
  killStaleAnvil,
  loadEnv,
  resetAnvil,
  spawnAnvil,
  waitForAnvil,
} from "./anvil-config";

// Every workspace with a test/integration directory — derived from the
// filesystem so new modules are picked up without touching this script.
// Positional args filter it: `bun scripts/run-integration-tests.ts std vault`
// runs only the workspaces whose path contains one of the args.
const ROOT = resolve(import.meta.dir, "..");
const allPackages = ["packages", "modules"].flatMap((group) =>
  readdirSync(resolve(ROOT, group), { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(resolve(ROOT, group, entry.name, "test", "integration")),
    )
    .map((entry) => `${group}/${entry.name}`)
    .sort(),
);
const argv = process.argv.slice(2);
const useCache =
  !argv.includes("--no-cache") && process.env.FORCE_INTEGRATION !== "1";
const filters = argv.filter((a) => a !== "--no-cache");
const PACKAGES_WITH_INTEGRATION_TESTS =
  filters.length === 0
    ? allPackages
    : allPackages.filter((pkg) => filters.some((f) => pkg.includes(f)));

// Claim a port before anything touches anvil, and export it so the child test
// processes inherit it. Two runners in the same checkout otherwise share one
// anvil, and whichever resets the fork first breaks the other's suite in ways
// that reproduce nowhere.
const anvilPortLock = acquireAnvilPort();
process.env[ANVIL_PORT_ENV] = String(anvilPortLock.port);
if (anvilPortLock.port !== 8545) {
  console.log(
    `anvil: port ${anvilPortLock.port} (8545 is in use by another runner)`,
  );
}

await loadEnv();

const endpoint = getEndpoint();
if (!endpoint) {
  console.error("ERROR: VITE_DRPC_API_KEY not set in .env");
  process.exit(1);
}

console.log("Starting Anvil...");
let anvil = await ensureAnvil();

/**
 * Skip a suite whose inputs have not changed since it last passed.
 *
 * A full sweep costs minutes and most of it re-runs suites nothing touched.
 * The key is a hash of the suite's own `src` and `test` trees plus the shared
 * packages every module compiles against, so editing the SDK re-runs
 * everything and editing one module re-runs one.
 *
 * Deliberately NOT turbo: turbo would run the suites in parallel against a
 * single shared anvil, and these tests mutate chain state and reset between
 * packages. Order already matters enough to have produced flaky failures.
 *
 * Only PASSES are recorded, so a failing suite always re-runs. Chain state is
 * not part of the key — the fork block moves on its own, so pass
 * `--no-cache` (or set FORCE_INTEGRATION=1) when that is what you are
 * testing, and CI should always use it.
 */
const CACHE_DIR = resolve(ROOT, "node_modules/.cache");
const CACHE_FILE = join(CACHE_DIR, "integration-tests.json");
/** Every module compiles against these, so a change invalidates all suites. */
const SHARED = ["packages/sdk", "packages/core", "packages/test-utils"];

function hashTree(dir: string, hasher: Bun.CryptoHasher): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      hashTree(full, hasher);
    } else if (/\.(ts|json|md|sol)$/.test(entry.name)) {
      // Size plus mtime rather than contents: a full sweep would otherwise
      // read tens of megabytes to decide it has nothing to do.
      const st = statSync(full);
      hasher.update(`${full}:${st.size}:${st.mtimeMs}`);
    }
  }
}

function suiteKey(pkg: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  for (const dir of [pkg, ...SHARED]) {
    hashTree(resolve(ROOT, dir, "src"), hasher);
    hashTree(resolve(ROOT, dir, "test"), hasher);
  }
  return hasher.digest("hex");
}

function readCache(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, string>): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

/**
 * Cgroup memory cap for each suite. A runaway suite once ballooned to 28 GB
 * and the kernel OOM killer took it (and nearly the machine) down; the cap
 * makes it die alone with a clear signal instead. MemorySwapMax=0 is
 * required — with swap allowed the kernel swaps instead of killing.
 */
const SUITE_MEMORY_CAP = "8G";

function memoryCapPrefix(): string[] {
  const bin = Bun.which("systemd-run");
  if (!bin) return [];
  const probe = Bun.spawnSync([
    bin,
    "--user",
    "--scope",
    "--quiet",
    "--",
    "true",
  ]);
  if (probe.exitCode !== 0) return [];
  return [
    bin,
    "--user",
    "--scope",
    "--quiet",
    "-p",
    `MemoryMax=${SUITE_MEMORY_CAP}`,
    "-p",
    "MemorySwapMax=0",
    "--",
  ];
}

const capPrefix = memoryCapPrefix();
if (capPrefix.length === 0) {
  console.warn("systemd-run unavailable — suites run without a memory cap");
}

let exitCode = 0;

try {
  const cache = useCache ? readCache() : {};
  let skipped = 0;

  for (const pkg of PACKAGES_WITH_INTEGRATION_TESTS) {
    const key = suiteKey(pkg);
    if (useCache && cache[pkg] === key) {
      console.log(`--- ${pkg}: unchanged since it last passed, skipping ---`);
      skipped += 1;
      continue;
    }

    // Every package starts from the pristine pinned fork: a reset discards
    // whatever the previous suite mutated (mints, sim:fork resets...). It
    // doubles as a health check — anvil 1.5.x occasionally wedges (alive
    // but unresponsive), so a failed reset triggers a restart.
    if (!(await resetAnvil(endpoint))) {
      console.warn("anvil: reset failed — restarting…");
      anvil?.kill();
      killStaleAnvil();
      anvil = spawnAnvil(endpoint);
      if (!(await waitForAnvil(30_000))) {
        console.error("ERROR: could not restart anvil, aborting");
        exitCode = 1;
        break;
      }
    }

    console.log(`\n--- Running integration tests: ${pkg} ---`);
    const result = Bun.spawnSync(
      [...capPrefix, "bun", "test", "--timeout", "30000", "./test/integration"],
      {
        cwd: resolve(import.meta.dir, "..", pkg),
        env: process.env,
        stdout: "inherit",
        stderr: "inherit",
      },
    );
    if (result.exitCode === 0) {
      cache[pkg] = key;
      if (useCache) writeCache(cache);
    } else {
      exitCode = 1;
      delete cache[pkg];
      if (useCache) writeCache(cache);
    }
  }

  if (skipped > 0) {
    console.log(
      `\n${skipped} suite(s) skipped as unchanged — \`--no-cache\` runs everything.`,
    );
  }
} finally {
  console.log("\nStopping Anvil...");
  anvil?.kill();
  anvilPortLock.release();
}

process.exit(exitCode);
