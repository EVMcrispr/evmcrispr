import { defineAction } from "@evmcrispr/sdk";
import { describeFrameAction } from "./describe";
import type { FrameActionData } from "./frame-action";
import { sendFrameAction } from "./send";
import { simulateFrameAction } from "./simulate/simulate";

/** `frames:tx`'s action: one EIP-8141 frame transaction. */
export const frameAction = defineAction<FrameActionData>("frames", "frame", {
  describe: describeFrameAction,
  send: sendFrameAction,
  simulate: simulateFrameAction,
});

export const actions = { frame: frameAction };
