let ready: Promise<typeof import("./pkg/revm_sim")> | null = null;

/**
 * Loads and initializes the revm wasm module once per JS context (worker or
 * test process). The pkg/ artifacts are committed — rebuild with
 * `bun scripts/build-wasm.ts` after changing modules/sim/rust.
 */
export function loadRevm(): Promise<typeof import("./pkg/revm_sim")> {
  ready ??= (async () => {
    const mod = await import("./pkg/revm_sim");
    const url = new URL("./pkg/revm_sim_bg.wasm", import.meta.url);
    if (typeof process !== "undefined" && process.versions?.node) {
      // bun/node (tests, CLI): no fetch for file: URLs in node — read bytes.
      const { readFile } = await import("node:fs/promises");
      await mod.default({ module_or_path: await readFile(url) });
    } else {
      // Browser/worker: Vite rewrites the URL to the emitted hashed asset.
      await mod.default({ module_or_path: url });
    }
    return mod;
  })();
  return ready;
}
