import { profile as tracer } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import type { Address, Hex } from "viem";
import { ATOMIC_BATCH_FLAG } from "./frames";
import type { FrameRequest, Profile } from "./types";

/**
 * A frame as a host describes it, by name rather than by the profile's
 * numbers (structurally EVMcrispr's `FrameSpec`, without depending on it).
 */
export interface FrameSpecLike {
  mode: "verify" | "sender" | "default";
  /** What a verify frame approves. */
  approve?: "execution" | "payment" | "both" | undefined;
  /** ATOMIC_BATCH_FLAG: this frame and the next run atomically. */
  atomic?: boolean | undefined;
  /** `null` means the transaction's sender. */
  target: Address | null;
  data: Hex;
  value: bigint;
  /** limits.execution */
  gas?: bigint | undefined;
  /** limits.state */
  stateGas?: bigint | undefined;
}

const MODES = {
  verify: "VERIFY",
  sender: "SENDER",
  default: "DEFAULT",
} as const;
const SCOPES = {
  execution: "EXECUTION",
  payment: "PAYMENT",
  both: "EXECUTION_AND_PAYMENT",
} as const;

/** How many frames the validation prefix holds: up to the last verify
 *  frame (a pre_verify `default` frame sits inside it). */
export function prefixLength(frames: readonly FrameSpecLike[]): number {
  let last = -1;
  frames.forEach((f, i) => {
    if (f.mode === "verify") last = i;
  });
  return last + 1;
}

/**
 * The frames as viem-frames lays them out. A validation-prefix frame
 * carries its own limits (`gas`, state 0): nothing sizes it. A body frame
 * carries limits only when it has both `gas` and `stateGas`; otherwise they
 * are left for preparing to size.
 */
export function toFrameRequests(
  frames: readonly FrameSpecLike[],
  profile: Profile = tracer,
): FrameRequest[] {
  const prefix = prefixLength(frames);
  return frames.map((frame, i) => {
    const mode = profile.frameModes[MODES[frame.mode]];
    if (mode === undefined)
      throw new Error(`The frame profile has no ${frame.mode} mode`);
    const scope = frame.approve
      ? profile.approveScopes[SCOPES[frame.approve]]
      : 0;
    if (scope === undefined)
      throw new Error(`The frame profile has no ${frame.approve} scope`);
    let limits: FrameRequest["limits"];
    if (i < prefix) {
      if (frame.gas !== undefined) limits = { execution: frame.gas, state: 0n };
    } else if (frame.gas !== undefined && frame.stateGas !== undefined) {
      limits = { execution: frame.gas, state: frame.stateGas };
    }
    return {
      mode,
      flags: scope | (frame.atomic ? ATOMIC_BATCH_FLAG : 0),
      target: frame.target,
      limits,
      value: frame.value,
      data: frame.data,
    };
  });
}
