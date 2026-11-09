import type { FeeFields, ModuleAction } from "@evmcrispr/sdk";
import type { Address } from "viem";

/**
 * One frame of an EIP-8141 frame transaction, as `frames:tx` lays it out.
 */
export interface FrameSpec {
  /** `postTx`: a POST_TX frame (`post-verify`), on networks that run them. */
  mode: "verify" | "sender" | "default" | "postTx";
  /** What a verify frame approves. */
  approve?: "execution" | "payment" | "both";
  /** ATOMIC_BATCH_FLAG: this frame and the next run atomically. */
  atomic?: boolean;
  /** `null` means the transaction's sender. */
  target: Address | null;
  data: `0x${string}`;
  value: bigint;
  /** limits.execution */
  gas?: bigint;
  /** limits.state */
  stateGas?: bigint;
}

/** What `frames:tx` hands the module to send: the frames, the mempool,
 *  and the account they are sent from when it is a FrameAccount. */
export interface FrameActionData {
  frames: FrameSpec[];
  mempool: "alt" | "canonical";
  /** Set when the sender is a FrameAccount the `owner` wallet signs for. */
  account?: { kind: "frame-account"; owner: Address };
  /** The fees `frames:tx` was given; without them the node's are used. */
  fees?: FeeFields;
}

/** The frames module's `frame` action. */
export type FrameModuleAction = ModuleAction<FrameActionData>;
