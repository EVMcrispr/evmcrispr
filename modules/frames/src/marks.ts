import type { TransactionAction } from "@evmcrispr/sdk";

export type FrameMark =
  | { mode: "default" }
  | { mode: "verify"; approve: "execution" | "payment" | "both" }
  /** A POST_TX frame, from `post-verify`: the script line of its check. */
  | { mode: "postTx"; line?: number };

const marks = new WeakMap<TransactionAction, FrameMark>();

/** Tag an action so the layout makes it a `default`, `verify` or `postTx` frame. */
export function markFrame(action: TransactionAction, mark: FrameMark): void {
  marks.set(action, mark);
}

export function frameMarkOf(action: TransactionAction): FrameMark | undefined {
  return marks.get(action);
}
