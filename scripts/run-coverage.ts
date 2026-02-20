#!/usr/bin/env bun
/**
 * Coverage runner script.
 * Starts Anvil, runs coverage (unit + integration) for each module sequentially,
 * stops Anvil, then merges lcov reports.
 */
import { resolve } from "node:path";
import {
  CHAIN_ID,
  FORK_BLOCK_NUMBER,
  getEndpoint,
  isAnvilRunning,
  loadEnv,
} from "./anvil-config";

const PACKAGES = [
  "packages/core",
  "modules/std",
  "modules/aragonos",
  "modules/giveth",
  "modules/sim",
  "modules/ens",
];

await loadEnv();

const endpoint = getEndpoint();
if (!endpoint) {
  console.error("ERROR: VITE_DRPC_API_KEY not set in .env");
  process.exit(1);
}

console.log("Starting Anvil...");

const anvil = Bun.spawn([
  "anvil",
  "--fork-url",
  endpoint,
  "--fork-block-number",
  String(FORK_BLOCK_NUMBER),
  "--chain-id",
  String(CHAIN_ID),
  "--silent",
]);

for (let i = 0; i < 20; i++) {
  if (await isAnvilRunning()) break;
  await Bun.sleep(500);
}

if (!(await isAnvilRunning())) {
  console.error("ERROR: Anvil failed to start within 10s");
  anvil.kill();
  process.exit(1);
}

let exitCode = 0;

try {
  for (const pkg of PACKAGES) {
    console.log(`\n--- Running coverage: ${pkg} ---`);
    const pkgDir = resolve(import.meta.dir, "..", pkg);
    const result = Bun.spawnSync(
      [
        "bun",
        "test",
        "--coverage",
        "--coverage-reporter=text",
        "--coverage-reporter=lcov",
        "--coverage-skip-test-files",
        "./test",
      ],
      {
        cwd: pkgDir,
        env: process.env,
        stdout: "inherit",
        stderr: "inherit",
      },
    );
    if (result.exitCode !== 0) {
      exitCode = 1;
    }
  }
} finally {
  console.log("\nStopping Anvil...");
  anvil.kill();
}

console.log("\nMerging coverage reports...");
const mergeResult = Bun.spawnSync(
  ["bun", "scripts/merge-coverage.ts"],
  {
    cwd: resolve(import.meta.dir, ".."),
    env: process.env,
    stdout: "inherit",
    stderr: "inherit",
  },
);

if (mergeResult.exitCode !== 0) {
  console.error("ERROR: Failed to merge coverage reports");
  process.exit(1);
}

console.log("Done.");
process.exit(exitCode);
