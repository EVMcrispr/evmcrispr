// What a public mempool admits, as the Hegota devnet's (ethrex
// `hegota-devnet`) does: EIP-8141's mempool rules, a node's policy, not the
// chain's. The validation prefix must be one of four shapes, fit the node's
// verify-gas budget, and run only what cannot change between admission and
// inclusion (the ERC-7562-style trace rules of ethrex's ValidationObserver).
// Measured against `ethrex_simulateFrameTransaction` on 2026-11-10
// (test/devnet/hegota-admission.devnet.test.ts).
import type { SimStep } from "@evmcrispr/sdk";
import type { Profile } from "@evmcrispr/viem-frames";
import { type Address, getAddress, isAddressEqual } from "viem";
import type { SimFrame } from "./opcodes";

/** A network mempool's admission limits. */
export interface MempoolAdmission {
  /** MAX_VERIFY_GAS: the validation prefix's execution gas limits and the
   *  signature's verification cost together. */
  maxVerifyGas: bigint;
  /** EIP-7825: the most a transaction may declare, its intrinsic gas and
   *  its frames' execution limits (or its calldata floor, if more). */
  maxTxGas: bigint;
}

/** The frames that establish who pays, and how (EIP-8141 §Mempool). */
export interface ValidationPrefix {
  /** Indices of the prefix frames, in order. */
  frames: number[];
  /** The deploy frame, first of them, when there is one. */
  deploy?: number;
  /** The frame that approves payment. */
  pay: number;
}

/** The transaction's validation prefix, or why it has none: a verify frame
 *  approving both, or one approving execution then one approving payment,
 *  each after an optional deploy (default) frame. */
export function validationPrefix(
  frames: readonly SimFrame[],
  profile: Profile,
): ValidationPrefix | string {
  const DEFAULT = profile.frameModes.DEFAULT!;
  const VERIFY = profile.frameModes.VERIFY!;
  const { PAYMENT, EXECUTION } = profile.approveScopes;
  const BOTH = PAYMENT! | EXECUTION!;
  const scope = (i: number) => (frames[i] ? frames[i]!.flags & 3 : 0);
  const verify = (i: number, s: number) =>
    frames[i]?.mode === VERIFY && scope(i) === s;
  const start = frames[0]?.mode === DEFAULT ? 1 : 0;
  const deploy = start === 1 ? { deploy: 0 } : {};
  const before = start === 1 ? [0] : [];
  if (verify(start, EXECUTION!) && verify(start + 1, PAYMENT!))
    return {
      frames: [...before, start, start + 1],
      ...deploy,
      pay: start + 1,
    };
  if (verify(start, BOTH))
    return { frames: [...before, start], ...deploy, pay: start };
  return "its first frames are not a validation prefix a mempool takes: a verify frame approving execution and payment, or one approving execution then one approving payment, either after an optional deploy frame";
}

/** Why the transaction's shape is refused, before any frame runs. */
export function structureViolation(
  frames: readonly SimFrame[],
  prefix: ValidationPrefix,
  sender: Address,
  profile: Profile,
  rules: MempoolAdmission,
  signatureCost: bigint,
): string | undefined {
  const VERIFY = profile.frameModes.VERIFY!;
  const ATOMIC = profile.flagBits.ATOMIC_BATCH ?? 0;
  const twoVerifies =
    prefix.frames.filter((i) => i !== prefix.deploy).length === 2;
  for (const i of prefix.frames) {
    const f = frames[i]!;
    if (ATOMIC && f.flags & ATOMIC)
      return `frame ${i + 1} is in the validation prefix and starts an atomic group`;
    if (i === prefix.deploy) continue;
    // Only the pay frame of a two-verify prefix may target another account.
    if (!(twoVerifies && i === prefix.pay) && !isAddressEqual(f.target, sender))
      return `frame ${i + 1} is a verify frame approving execution for ${f.target}, not for the sender ${sender}`;
  }
  const last = prefix.frames.at(-1)!;
  const after = frames.findIndex((f, i) => i > last && f.mode === VERIFY);
  if (after >= 0)
    return `frame ${after + 1} is a verify frame after the validation prefix`;
  const prefixGas = prefix.frames.reduce((sum, i) => sum + frames[i]!.gas, 0n);
  if (prefixGas + signatureCost > rules.maxVerifyGas)
    return `its validation prefix may use ${prefixGas + signatureCost} gas (its frames' limits, and ${signatureCost} to verify the signature), more than the ${rules.maxVerifyGas} a mempool spends on validating one`;
  return undefined;
}

/** EIP-7825: why the transaction declares more gas than any may. */
export function capViolation(
  frames: readonly SimFrame[],
  intrinsic: bigint,
  floor: bigint,
  rules: MempoolAdmission,
): string | undefined {
  const declared = intrinsic + frames.reduce((sum, f) => sum + f.gas, 0n);
  const capped = declared > floor ? declared : floor;
  return capped > rules.maxTxGas
    ? `it declares ${capped} gas (its intrinsic gas and its frames' execution limits), more than the ${rules.maxTxGas} a transaction may (EIP-7825)`
    : undefined;
}

/** Opcodes a validation frame may not run: they read what changes between
 *  admission and inclusion. TIMESTAMP is allowed only in the expiry
 *  verifier, which no frame here runs. */
const BANNED: Record<number, string> = {
  49: "BALANCE",
  50: "ORIGIN",
  58: "GASPRICE",
  64: "BLOCKHASH",
  65: "COINBASE",
  66: "TIMESTAMP",
  67: "NUMBER",
  68: "PREVRANDAO",
  69: "GASLIMIT",
  71: "SELFBALANCE",
  72: "BASEFEE",
  73: "BLOBHASH",
  74: "BLOBBASEFEE",
  92: "TLOAD",
  93: "TSTORE",
  254: "INVALID",
  255: "SELFDESTRUCT",
};
const GAS = 0x5a;
const SLOAD = 0x54;
const SSTORE = 0x55;
const CALLCODE = 0xf2;
/** Calls: the target is the second stack word. */
const CALLS: Record<number, string> = {
  241: "CALL",
  242: "CALLCODE",
  244: "DELEGATECALL",
  250: "STATICCALL",
};
/** Code reads: the account is the top stack word. */
const CODE_READS: Record<number, string> = {
  59: "EXTCODESIZE",
  60: "EXTCODECOPY",
  63: "EXTCODEHASH",
};
const CREATES: Record<number, string> = { 240: "CREATE", 245: "CREATE2" };

/** What a validation frame's call observes to check the trace rules. */
export const OBSERVED: readonly number[] = [
  ...Object.keys(BANNED),
  ...Object.keys(CALLS),
  ...Object.keys(CODE_READS),
  ...Object.keys(CREATES),
]
  .map(Number)
  .concat([GAS, SLOAD, SSTORE]);

/** An account as a call target's check reads it, after the frame. */
export interface TargetState {
  code: `0x${string}`;
  balance: bigint;
  nonce: bigint;
}

const isPrecompile = (a: Address) => {
  const n = BigInt(a);
  return (n >= 1n && n <= 0x11n) || n === 0x100n;
};
const asAddress = (word: bigint | undefined) =>
  getAddress(`0x${(word ?? 0n).toString(16).padStart(40, "0").slice(-40)}`);

/** The first trace rule a validation frame's `steps` break, in the order it
 *  ran them. `read` gives an account a call or a code read reaches. */
export async function traceViolation(
  steps: readonly SimStep[],
  {
    sender,
    deploy,
    read,
  }: {
    sender: Address;
    /** Whether the frame is the deploy frame: it may write the sender's
     *  storage, create, and CALLCODE. */
    deploy: boolean;
    read: (address: Address) => Promise<TargetState>;
  },
): Promise<string | undefined> {
  for (const [k, step] of steps.entries()) {
    const op = step.opcode;
    if (op === GAS) {
      const next = steps[k + 1];
      if (!next || next.index !== step.index + 1 || !CALLS[next.opcode])
        return "it runs GAS other than right before a call";
      continue;
    }
    if (BANNED[op]) return `it runs ${BANNED[op]}`;
    if (op === CALLCODE && !deploy) return "it runs CALLCODE";
    if (op === SLOAD && !isAddressEqual(step.address, sender))
      return `it reads the storage of ${step.address}, which is not the sender`;
    if (op === SSTORE && !(deploy && isAddressEqual(step.address, sender)))
      return deploy
        ? `it writes the storage of ${step.address}, which is not the sender`
        : "it writes storage outside a deploy frame";
    if (CREATES[op] && !deploy)
      return `it runs ${CREATES[op]} outside a deploy frame`;
    const name = CALLS[op] ?? CODE_READS[op];
    if (name) {
      const target = asAddress(CALLS[op] ? step.stack[1] : step.stack[0]);
      if (isAddressEqual(target, sender)) continue;
      const account = await read(target);
      if (account.code.toLowerCase().startsWith("0xef0100"))
        return `its ${name} reaches ${target}, an account delegated by EIP-7702`;
      if (isPrecompile(target)) continue;
      if (
        account.code === "0x" &&
        account.balance === 0n &&
        account.nonce === 0n
      )
        return `its ${name} reaches ${target}, which does not exist`;
    }
  }
  return undefined;
}
