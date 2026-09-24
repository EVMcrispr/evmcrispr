import type { Action, ActionReport } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import type { Transport } from "viem";
import { http } from "viem";

import type { EvmlTag } from "../evml/tag";
import {
  deserializeError,
  type MainToWorkerMessage,
  serializeError,
  type WorkerEvmlConfig,
  type WorkerToMainMessage,
} from "./protocol";

export type {
  MainToWorkerMessage,
  WorkerEvmlConfig,
  WorkerToMainMessage,
} from "./protocol";

/** The dedicated-worker global scope, typed structurally so core compiles
 *  without the WebWorker lib. */
interface WorkerScope {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: MainToWorkerMessage }) => void) | null;
}

interface PendingAction {
  resolve(value: unknown): void;
  reject(error: Error): void;
  /** The interpreter's send report: `action-progress` feeds it. */
  report?: ActionReport;
}

/**
 * Serve EVML runs over the worker message protocol. Call this from a
 * dedicated-worker entry file after registering the modules the runs
 * should see:
 *
 * ```ts
 * import "virtual:evmcrispr-modules"; // or registerAllModules()
 * import { evml } from "@evmcrispr/core";
 * import { exposeEvmlWorker } from "@evmcrispr/core/worker";
 * exposeEvmlWorker(evml);
 * ```
 */
export function exposeEvmlWorker(tag: EvmlTag): void {
  const scope = globalThis as unknown as WorkerScope;
  const post = (message: WorkerToMainMessage) => scope.postMessage(message);

  const controllers = new Map<string, AbortController>();
  const pendingActions = new Map<string, Map<number, PendingAction>>();

  const configuredTag = (id: string, config: WorkerEvmlConfig): EvmlTag => {
    const transports: Record<number, Transport> = {};
    for (const [chainId, url] of Object.entries(config.rpcUrls ?? {})) {
      transports[Number(chainId)] = http(url);
    }
    return tag.with({
      stdin: config.stdin,
      account: config.account,
      sender: config.sender,
      chainId: config.chainId,
      follow: config.follow,
      transports,
      onLog: (message, _prev, meta) =>
        post({
          kind: "log",
          id,
          message,
          ...(meta?.box ? { box: meta.box } : {}),
        }),
      onBox: (snapshot) => post({ kind: "box", id, snapshot }),
      onOutput: (message) => post({ kind: "output", id, message }),
      onLine: (line) => post({ kind: "line", id, line }),
    });
  };

  const run = async (id: string, fn: () => Promise<unknown>) => {
    try {
      const value = await fn();
      post({ kind: "result", id, ok: true, value });
    } catch (err) {
      post({ kind: "result", id, ok: false, error: serializeError(err) });
    } finally {
      controllers.delete(id);
      pendingActions.delete(id);
    }
  };

  scope.onmessage = (event) => {
    const msg = event.data;
    switch (msg.kind) {
      case "simulate": {
        const controller = new AbortController();
        controllers.set(msg.id, controller);
        run(msg.id, () =>
          configuredTag(msg.id, msg.config)
            .script(msg.source)
            .simulate({ ...msg.options, signal: controller.signal }),
        );
        break;
      }

      case "interpret": {
        const controller = new AbortController();
        controllers.set(msg.id, controller);
        const pending = new Map<number, PendingAction>();
        pendingActions.set(msg.id, pending);
        let nextActionId = 0;
        const onAction = (action: Action, report?: ActionReport) =>
          new Promise<unknown>((resolve, reject) => {
            const actionId = nextActionId++;
            pending.set(actionId, { resolve, reject, report });
            post({ kind: "action", id: msg.id, actionId, action });
          });
        run(msg.id, () =>
          configuredTag(msg.id, msg.config)
            .script(msg.source)
            .interpret({ onAction, signal: controller.signal }),
        );
        break;
      }

      case "action-result": {
        const pending = pendingActions.get(msg.id);
        const entry = pending?.get(msg.actionId);
        if (!pending || !entry) return;
        pending.delete(msg.actionId);
        if (msg.ok) {
          entry.resolve(msg.value);
        } else {
          entry.reject(
            deserializeError(msg.error ?? { name: "Error", message: "" }),
          );
        }
        break;
      }

      case "action-progress": {
        pendingActions.get(msg.id)?.get(msg.actionId)?.report?.sent(msg.hash);
        break;
      }

      case "abort": {
        controllers.get(msg.id)?.abort();
        // Actions still on the main thread (a wallet prompt, a receipt
        // wait) never answer after a cancel: settle them here so the run
        // unwinds and ends its boxes before the kill grace runs out.
        const pending = pendingActions.get(msg.id);
        for (const entry of pending?.values() ?? [])
          entry.reject(new ErrorException("Execution cancelled"));
        pending?.clear();
        break;
      }
    }
  };

  post({ kind: "ready" });
}
