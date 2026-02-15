#!/usr/bin/env bun
/**
 * Integration test runner script
 * Starts Anvil, runs integration tests sequentially for each module, then stops Anvil.
 * This ensures tests don't run in parallel against the same Anvil instance.
 */
import { resolve } from "node:path";
import {
  CHAIN_ID,
  FORK_BLOCK_NUMBER,
  isAnvilRunning,
  loadEnv,
} from "./anvil-config";

const PACKAGES_WITH_INTEGRATION_TESTS = [
  "modules/std",
  "modules/aragonos",
  "modules/giveth",
];

await loadEnv();

const endpoint = process.env.ARCHIVE_NODE_ENDPOINT;
if (!endpoint) {
  console.error("ERROR: ARCHIVE_NODE_ENDPOINT not set in .env");
  process.exit(1);
}

console.log("Starting Anvil...");

// Start Anvil
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

// Poll until ready (up to 10s)
for (let i = 0; i < 20; i++) {
  if (await isAnvilRunning()) break;
  await Bun.sleep(500);
}

let exitCode = 0;

try {
  for (const pkg of PACKAGES_WITH_INTEGRATION_TESTS) {
    console.log(`\n--- Running integration tests: ${pkg} ---`);
    const result = Bun.spawnSync(["bun", "test", "./test/integration"], {
      cwd: resolve(import.meta.dir, "..", pkg),
      env: process.env,
      stdout: "inherit",
      stderr: "inherit",
    });
    if (result.exitCode !== 0) {
      exitCode = 1;
    }
  }
} finally {
  console.log("\nStopping Anvil...");
  anvil.kill();
}

process.exit(exitCode);
