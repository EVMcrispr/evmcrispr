#!/usr/bin/env bun
/**
 * Integration test runner script
 * Starts Anvil, runs integration tests sequentially for each module, then stops Anvil.
 * This ensures tests don't run in parallel against the same Anvil instance.
 */
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
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
const filters = process.argv.slice(2);
const PACKAGES_WITH_INTEGRATION_TESTS =
  filters.length === 0
    ? allPackages
    : allPackages.filter((pkg) => filters.some((f) => pkg.includes(f)));

await loadEnv();

const endpoint = getEndpoint();
if (!endpoint) {
  console.error("ERROR: VITE_DRPC_API_KEY not set in .env");
  process.exit(1);
}

console.log("Starting Anvil...");
let anvil = await ensureAnvil();

let exitCode = 0;

try {
  for (const pkg of PACKAGES_WITH_INTEGRATION_TESTS) {
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
      ["bun", "test", "--timeout", "30000", "./test/integration"],
      {
        cwd: resolve(import.meta.dir, "..", pkg),
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
  anvil?.kill();
}

process.exit(exitCode);
