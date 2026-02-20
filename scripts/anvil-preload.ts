/**
 * Bun test preload script -- auto-starts anvil for integration tests.
 *
 * Configured in the root bunfig.toml so `bun test <file>` from the repo root
 * just works without a wrapper script.
 */
import { afterAll, beforeAll } from "bun:test";
import {
  CHAIN_ID,
  FORK_BLOCK_NUMBER,
  getEndpoint,
  isAnvilRunning,
  loadEnv,
} from "./anvil-config";

let anvil: ReturnType<typeof Bun.spawn> | undefined;

beforeAll(async () => {
  await loadEnv();

  if (await isAnvilRunning()) return; // already running, nothing to do

  const endpoint = getEndpoint();
  if (!endpoint) {
    // No API key configured -- skip anvil. Unit tests will still work fine;
    // integration tests will fail with a clear connection error.
    return;
  }

  anvil = Bun.spawn([
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
    if (await isAnvilRunning()) return;
    await Bun.sleep(500);
  }
  throw new Error("Anvil failed to start within 10s");
});

afterAll(() => {
  if (anvil) {
    anvil.kill();
    anvil = undefined;
  }
});
