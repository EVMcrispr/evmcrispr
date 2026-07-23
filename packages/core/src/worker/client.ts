import type { Action } from "@evmcrispr/sdk";
import type { Transport, WalletClient } from "viem";
import { http } from "viem";

import {
  type ExecuteOptions,
  type ExecutionResult,
  executeScript,
} from "../evml/execute";
import { ModuleRegistry } from "../evml/registry";
import type { SimulateOptions, SimulationResult } from "../evml/simulate";
import type { EvmlConfig } from "../evml/types";
import {
  deserializeError,
  type MainToWorkerMessage,
  type SerializedError,
  type SimulateRequestOptions,
  serializeError,
  type WorkerEvmlConfig,
  type WorkerLike,
  type WorkerToMainMessage,
} from "./protocol";

export type {
  SerializedError,
  WorkerEvmlConfig,
  WorkerLike,
} from "./protocol";

/** Worker config plus the main-thread callbacks the client bridges. */
export interface WorkerEvmlClientConfig extends WorkerEvmlConfig {
  onLog?: (message: string) => void;
  onLine?: (line: number | null) => void;
}

export interface WorkerEvmlScript {
  /** Run the script inside `sim:fork` — entirely in the worker. */
  simulate(options?: SimulateOptions): Promise<SimulationResult>;
  /** Interpret in the worker, execute every action on this thread with
   *  `walletClient` (signing and custom handlers never leave it). */
  execute(
    walletClient: WalletClient,
    options?: ExecuteOptions,
  ): Promise<ExecutionResult>;
}

/** Minimal worker-backed mirror of the `evml` tag: `.with()` + `.script()`.
 *  Validation/workspace features stay on the main-thread tag. */
export interface WorkerEvml {
  with(overrides: WorkerEvmlClientConfig): WorkerEvml;
  script(source: string): WorkerEvmlScript;
  /** Hard-stop the worker; pending runs reject and the next run respawns. */
  terminate(): void;
}

interface RunCallbacks {
  onLog?(message: string): void;
  onLine?(line: number | null): void;
  onAction?(actionId: number, action: Action): void;
  signal?: AbortSignal;
}

interface PendingRun extends RunCallbacks {
  resolve(value: unknown): void;
  reject(error: Error): void;
  cleanup(): void;
}

/** How long a soft abort may go unanswered before the worker is killed —
 *  covers the VM stuck in a synchronous loop that never sees the signal. */
const DEFAULT_KILL_GRACE_MS = 2_000;

class WorkerManager {
  #factory: () => WorkerLike;
  #killGraceMs: number;
  #worker: WorkerLike | null = null;
  #ready: Promise<void> | null = null;
  #pending = new Map<string, PendingRun>();
  #nextRunId = 0;

  constructor(factory: () => WorkerLike, killGraceMs: number) {
    this.#factory = factory;
    this.#killGraceMs = killGraceMs;
  }

  #ensureWorker(): WorkerLike {
    if (this.#worker) return this.#worker;
    const worker = this.#factory();
    this.#worker = worker;
    this.#ready = new Promise<void>((resolve) => {
      worker.addEventListener(
        "message",
        (event: { data: WorkerToMainMessage }) => {
          if (event.data?.kind === "ready") resolve();
          this.#handleMessage(event.data);
        },
      );
    });
    worker.addEventListener("error", (event: { message?: string }) => {
      this.#crash(
        new Error(`EVML worker crashed: ${event.message ?? "unknown error"}`),
      );
    });
    return worker;
  }

  /** Terminate the worker and reject everything in flight. The next run
   *  lazily respawns a fresh worker. */
  #crash(error: Error): void {
    const pending = [...this.#pending.values()];
    this.#pending.clear();
    this.#worker?.terminate();
    this.#worker = null;
    this.#ready = null;
    for (const run of pending) {
      run.cleanup();
      run.reject(error);
    }
  }

  terminate(): void {
    this.#crash(new Error("Execution cancelled"));
  }

  #handleMessage(msg: WorkerToMainMessage): void {
    if (!msg || msg.kind === "ready") return;
    const run = this.#pending.get(msg.id);
    if (!run) return;
    switch (msg.kind) {
      case "log":
        run.onLog?.(msg.message);
        break;
      case "line":
        run.onLine?.(msg.line);
        break;
      case "action":
        run.onAction?.(msg.actionId, msg.action);
        break;
      case "result":
        this.#pending.delete(msg.id);
        run.cleanup();
        if (msg.ok) run.resolve(msg.value);
        else run.reject(deserializeError(msg.error));
        break;
    }
  }

  async #send(message: MainToWorkerMessage): Promise<void> {
    const worker = this.#ensureWorker();
    await this.#ready;
    // The worker may have been killed while we awaited readiness.
    if (this.#worker === worker) worker.postMessage(message);
  }

  run(
    message:
      | {
          kind: "simulate";
          source: string;
          config: WorkerEvmlConfig;
          options: SimulateRequestOptions;
        }
      | { kind: "interpret"; source: string; config: WorkerEvmlConfig },
    callbacks: RunCallbacks,
  ): { id: string; result: Promise<unknown> } {
    const id = `run-${this.#nextRunId++}`;
    const { signal } = callbacks;

    const result = new Promise<unknown>((resolve, reject) => {
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const onAbort = () => {
        void this.#send({ kind: "abort", id });
        killTimer = setTimeout(
          () => this.#crash(new Error("Execution cancelled")),
          this.#killGraceMs,
        );
      };
      const entry: PendingRun = {
        ...callbacks,
        resolve,
        reject,
        cleanup: () => {
          if (killTimer !== undefined) clearTimeout(killTimer);
          signal?.removeEventListener("abort", onAbort);
        },
      };
      this.#pending.set(id, entry);

      if (signal?.aborted) {
        this.#pending.delete(id);
        reject(new Error("Execution cancelled"));
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });

      this.#send({ ...message, id }).catch((err) => {
        if (this.#pending.get(id) !== entry) return;
        this.#pending.delete(id);
        entry.cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });

    return { id, result };
  }

  /** Reply to a proxied action. Falls back to an empty success when the
   *  handler's result isn't structured-cloneable. */
  replyAction(
    id: string,
    actionId: number,
    outcome:
      | { ok: true; value: unknown }
      | { ok: false; error: SerializedError },
  ): void {
    const base = { kind: "action-result" as const, id, actionId };
    const message = outcome.ok
      ? { ...base, ok: true as const, value: outcome.value }
      : { ...base, ok: false as const, error: outcome.error };
    this.#send(message).catch((err) => {
      console.warn(
        "EVML worker: action result is not structured-cloneable, " +
          "returning undefined to the script",
        err,
      );
      this.#send({ ...base, ok: true, value: undefined }).catch(() => {});
    });
  }
}

function toTransports(
  rpcUrls: Record<number, string> | undefined,
): Record<number, Transport> {
  const transports: Record<number, Transport> = {};
  for (const [chainId, url] of Object.entries(rpcUrls ?? {})) {
    transports[Number(chainId)] = http(url);
  }
  return transports;
}

/**
 * Worker-backed `evml` mirror. Interpretation (and the whole `sim:fork`
 * VM) runs inside the worker created by `workerFactory`; wallet signing
 * and action handlers stay on the calling thread.
 *
 * ```ts
 * const workerEvml = createWorkerEvml(
 *   () => new Worker(new URL("./evml.worker.ts", import.meta.url), { type: "module" }),
 *   { rpcUrls },
 * );
 * await workerEvml.with({ account }).script(source).simulate();
 * ```
 */
export function createWorkerEvml(
  workerFactory: () => WorkerLike,
  config: WorkerEvmlClientConfig = {},
  opts: { killGraceMs?: number } = {},
): WorkerEvml {
  const manager = new WorkerManager(
    workerFactory,
    opts.killGraceMs ?? DEFAULT_KILL_GRACE_MS,
  );
  return makeWorkerEvml(manager, config);
}

function makeWorkerEvml(
  manager: WorkerManager,
  config: WorkerEvmlClientConfig,
): WorkerEvml {
  const workerConfig = (
    account?: WorkerEvmlConfig["account"],
  ): WorkerEvmlConfig => ({
    account: config.account ?? account,
    chainId: config.chainId,
    rpcUrls: config.rpcUrls,
  });

  const script = (source: string): WorkerEvmlScript => ({
    async simulate(options: SimulateOptions = {}): Promise<SimulationResult> {
      const { signal, ...rest } = options;
      const { result } = manager.run(
        { kind: "simulate", source, config: workerConfig(), options: rest },
        { signal, onLog: config.onLog, onLine: config.onLine },
      );
      return result as Promise<SimulationResult>;
    },

    execute(
      walletClient: WalletClient,
      options: ExecuteOptions = {},
    ): Promise<ExecutionResult> {
      // Main-thread config for the handlers: same account/chain view as
      // the worker, with real viem transports for receipts and calls.
      const mainConfig: EvmlConfig = {
        account: config.account,
        chainId: config.chainId,
        transports: toTransports(config.rpcUrls),
        onLog: config.onLog,
        onLine: config.onLine,
      };
      return executeScript(
        source,
        // Modules live in the worker; the main-thread interpreter this
        // registry feeds is only the log/status plumbing.
        new ModuleRegistry(),
        mainConfig,
        walletClient,
        {
          ...options,
          interpretRunner: (src, dispatch, hooks) => {
            const { id, result } = manager.run(
              {
                kind: "interpret",
                source: src,
                config: workerConfig(hooks.account),
              },
              {
                signal: hooks.signal,
                onLog: hooks.onLog,
                onLine: hooks.onLine,
                onAction: (actionId, action) => {
                  dispatch(action).then(
                    (value) =>
                      manager.replyAction(id, actionId, { ok: true, value }),
                    (err) =>
                      manager.replyAction(id, actionId, {
                        ok: false,
                        error: serializeError(err),
                      }),
                  );
                },
              },
            );
            return result.then(() => undefined);
          },
        },
      );
    },
  });

  return {
    with: (overrides) => makeWorkerEvml(manager, { ...config, ...overrides }),
    script,
    terminate: () => manager.terminate(),
  };
}
