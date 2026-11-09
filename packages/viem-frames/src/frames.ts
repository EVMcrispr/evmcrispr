import { profile as tracer } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import type { Address, Hex } from "viem";
import type { FrameRequest, Profile } from "./types";

/** Bit 2 of a frame's flags: the frame and the ones after it, up to the first without it, revert together. */
export const ATOMIC_BATCH_FLAG = 0x4;

/**
 * Execution gas for a VERIFY frame whose target has no code: the protocol's
 * default logic only checks the signature. The workshop's self-relay uses
 * the same figure.
 */
const DEFAULT_CODE_VERIFY_GAS = 30_000n;
/** Execution gas for a VERIFY frame that runs a paymaster's code. */
const PAYMASTER_VERIFY_GAS = 50_000n;

interface VerifyOptions {
  /** `limits.execution`; the sidecar does not estimate validation frames. */
  gas?: bigint | undefined;
  data?: Hex | undefined;
  profile?: Profile | undefined;
}

function verify(
  scope: "EXECUTION" | "PAYMENT" | "EXECUTION_AND_PAYMENT",
  target: Address | null,
  gas: bigint,
  { data = "0x", profile = tracer }: VerifyOptions,
): FrameRequest {
  return {
    mode: modeOf(profile, "VERIFY"),
    flags: scopeOf(profile, scope),
    target,
    limits: { execution: gas, state: 0n },
    value: 0n,
    data,
  };
}

/** `self_verify`: the sender approves execution and pays for it. */
export function selfVerify(options: VerifyOptions = {}): FrameRequest {
  return verify(
    "EXECUTION_AND_PAYMENT",
    null,
    options.gas ?? DEFAULT_CODE_VERIFY_GAS,
    options,
  );
}

/** `only_verify`: the sender approves execution; a later `pay` frame pays. */
export function onlyVerify(options: VerifyOptions = {}): FrameRequest {
  return verify(
    "EXECUTION",
    null,
    options.gas ?? DEFAULT_CODE_VERIFY_GAS,
    options,
  );
}

/** `pay`: `paymaster` approves payment. */
export function pay(
  paymaster: Address,
  options: VerifyOptions = {},
): FrameRequest {
  return verify(
    "PAYMENT",
    paymaster,
    options.gas ?? PAYMASTER_VERIFY_GAS,
    options,
  );
}

/**
 * A SENDER frame: a call made by `tx.sender`. Leave `gas` and `stateGas`
 * out to have them estimated.
 */
export function call({
  to,
  data = "0x",
  value = 0n,
  gas,
  stateGas,
  profile = tracer,
}: {
  to: Address;
  data?: Hex | undefined;
  value?: bigint | undefined;
  gas?: bigint | undefined;
  /** EIP-8037 state gas, charged for new accounts and storage slots. */
  stateGas?: bigint | undefined;
  profile?: Profile | undefined;
}): FrameRequest {
  return {
    mode: modeOf(profile, "SENDER"),
    flags: 0,
    target: to,
    limits:
      gas === undefined && stateGas === undefined
        ? undefined
        : { execution: gas ?? 0n, state: stateGas ?? 0n },
    value,
    data,
  };
}

/**
 * Makes `frames` one atomic batch: if any of them fails, all of them roll
 * back and the rest are skipped. Every frame but the last carries
 * `ATOMIC_BATCH_FLAG`. A batch may hold no VERIFY frame.
 */
export function atomic(frames: readonly FrameRequest[]): FrameRequest[] {
  return frames.map((frame, i) => {
    if (frame.mode === tracer.frameModes.VERIFY)
      throw new Error("An atomic batch cannot contain a VERIFY frame");
    return i < frames.length - 1
      ? { ...frame, flags: frame.flags | ATOMIC_BATCH_FLAG }
      : frame;
  });
}

function modeOf(profile: Profile, name: string): number {
  const mode = profile.frameModes[name];
  if (mode === undefined)
    throw new Error(`Profile "${profile.id}" has no ${name} frame mode`);
  return mode;
}

function scopeOf(profile: Profile, name: string): number {
  const scope = profile.approveScopes[name];
  if (scope === undefined)
    throw new Error(`Profile "${profile.id}" has no ${name} approval scope`);
  return scope;
}
