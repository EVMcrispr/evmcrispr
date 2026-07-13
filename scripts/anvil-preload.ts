/**
 * Bun test preload script -- auto-starts anvil for integration tests.
 *
 * Configured in the root bunfig.toml so `bun test <file>` from the repo root
 * just works without a wrapper script.
 *
 * The work happens at module top level (preloads support top-level await)
 * rather than in a beforeAll hook: bun caps hooks at 5 seconds regardless of
 * the configured test timeout, and a cold anvil fork can take longer —
 * hitting that cap surfaced as opaque "(unnamed) hook timed out" failures
 * when many suites ran at once.
 */
import { afterAll } from "bun:test";
import { ensureAnvil, loadEnv } from "./anvil-config";

await loadEnv();

// Reuses a live anvil, replaces a wedged one, or starts a fresh one. When no
// API key is configured it does nothing: unit tests still work fine and
// integration tests fail with a clear connection error.
let anvil = await ensureAnvil();

afterAll(() => {
  if (anvil) {
    anvil.kill();
    anvil = undefined;
  }
});
