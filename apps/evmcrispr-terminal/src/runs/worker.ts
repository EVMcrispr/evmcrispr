import {
  createWorkerEvml,
  type WorkerEvml,
} from "@evmcrispr/core/worker-client";
import { moduleEntries } from "@evmcrispr/modules";
import { rpcUrls } from "../config/rpc";

/** A worker-backed `evml` of its own, spawned when first used. Each run
 *  gets one: cancelling a run that will not stop ends by killing its
 *  worker, and a shared one would take every other run with it. */
export function createRunWorker(): WorkerEvml {
  return createWorkerEvml(
    () =>
      new Worker(new URL("../workers/evml.worker.ts", import.meta.url), {
        type: "module",
      }),
    // A module's actions are sent here, on the main thread, by the module:
    // it is loaded on the first one.
    { rpcUrls, modules: moduleEntries },
  );
}
