#!/usr/bin/env bun
/**
 * Integration test runner script
 * Starts Anvil, runs integration tests sequentially for each module, then stops Anvil.
 * This ensures tests don't run in parallel against the same Anvil instance.
 */
import { resolve } from "node:path";

const FORK_BLOCK_NUMBER = 34630239;
const CHAIN_ID = 100;
const PACKAGES_WITH_INTEGRATION_TESTS = [
  "modules/std",
  "modules/aragonos",
  "modules/giveth",
];

// Load .env from root
const envFile = Bun.file(resolve(import.meta.dir, "../.env"));
if (await envFile.exists()) {
  const text = await envFile.text();
  for (const line of text.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && !key.startsWith("#")) {
      process.env[key.trim()] = rest.join("=").trim();
    }
  }
}

const endpoint = process.env.ARCHIVE_NODE_ENDPOINT;
if (!endpoint) {
  console.error("ERROR: ARCHIVE_NODE_ENDPOINT not set in packages/core/.env");
  process.exit(1);
}

console.log("Starting Anvil...");

// Start Anvil
const anvil = Bun.spawn([
  "anvil",
  "--fork-url", endpoint,
  "--fork-block-number", String(FORK_BLOCK_NUMBER),
  "--chain-id", String(CHAIN_ID),
  "--silent",
]);

// Wait for Anvil to start
await Bun.sleep(2000);

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
