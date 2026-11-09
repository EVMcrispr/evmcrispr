import { defineAction } from "@evmcrispr/sdk";
import { describeFrameAction } from "./describe";
import type { FrameActionData } from "./frame-action";
import { sendFrameAction } from "./send";

/** `frames:tx`'s action: one EIP-8141 frame transaction. */
export const frameAction = defineAction<FrameActionData>("frames", "frame", {
  describe: describeFrameAction,
  send: sendFrameAction,
});

export const actions = { frame: frameAction };
