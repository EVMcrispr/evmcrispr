import type { ActionOutcome } from "@evmcrispr/sdk";
import { RevertError } from "@evmcrispr/sdk";

const MAX_DEPTH = 8;

/** Walks the cause chain: names survive the worker boundary
 *  (see worker/protocol.ts serializeError), classes may not. */
export function classifyError(err: unknown): ActionOutcome {
  let level: unknown = err;
  for (let depth = 0; level && depth < MAX_DEPTH; depth++) {
    const { name, code } = level as { name?: string; code?: number };
    if (name === "UserRejectedRequestError" || code === 4001)
      return { kind: "rejected", reason: "Rejected in wallet" };
    if (level instanceof RevertError || name === "RevertError")
      return { kind: "reverted", reason: (level as Error).message };
    level = (level as { cause?: unknown }).cause;
  }
  return {
    kind: "failed",
    reason: err instanceof Error ? err.message : String(err),
  };
}
