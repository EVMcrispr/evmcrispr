import {
  createWorkerEvml,
  type WorkerEvml,
} from "@evmcrispr/core/worker-client";
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
    { rpcUrls },
  );
}
