import { createWorkerEvml } from "@evmcrispr/core/worker-client";

import { rpcUrls } from "../config/rpc";

/**
 * Worker-backed EVML runner: interpretation and `sim:fork` VMs run off
 * the main thread; wallet signing stays on it. Shared lazily-spawned
 * worker — cancellation can hard-kill it and the next run respawns.
 */
export const workerEvml = createWorkerEvml(
  () =>
    new Worker(new URL("../workers/evml.worker.ts", import.meta.url), {
      type: "module",
    }),
  { rpcUrls },
);
