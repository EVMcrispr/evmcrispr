import {
  type Action,
  asNum,
  type BatchedAction,
  ErrorException,
  Num,
  type TransactionAction,
} from "@evmcrispr/sdk";
import { type Address, encodeFunctionData, type Hex } from "viem";
import { frameAccountAbi } from "./contracts/artifacts";
import type { FrameSpec } from "./frame-action";
import { frameMarkOf } from "./marks";

export const SELF_VERIFY_GAS = 30_000n;
export const PAYMASTER_VERIFY_GAS = 50_000n;
export const MAX_FRAMES = 64;
/**
 * State gas reserved for a body frame without `--state-gas`: one new account
 * (183,600 on these devnets). Unused state gas is refunded, so the
 * reservation costs nothing once mined.
 */
export const DEFAULT_STATE_GAS = 200_000n;
export const ACCOUNT_CHECK_GAS = 40_000n;
/** `verify()` of a sponsor. */
export const SPONSOR_CHECK_DATA = "0xfc735e99" as Hex;

const accountCheck = (scope: 2 | 3): Hex =>
  encodeFunctionData({
    abi: frameAccountAbi,
    functionName: "verify",
    args: [scope],
  });

/** An option's value as a gas limit: a whole number, zero or more. */
export function gasOption(value: unknown, option: string): bigint {
  const n = asNum(value);
  if (!n?.isInteger() || n.lt(Num(0)))
    throw new ErrorException(
      `${option} must be a non-negative integer, not ${String(value)}: it is a gas limit.`,
    );
  return n.toBigInt();
}

/**
 * Refuses frames that leave a limit to be sized, numbered as `frames:tx`
 * numbers them (from 1). The validation prefix runs up to the last verify:
 * its frames need execution gas only; every frame after it needs both.
 */
export function requireLimits(frames: readonly FrameSpec[]): void {
  let prefix = 0;
  frames.forEach((f, i) => {
    if (f.mode === "verify") prefix = i + 1;
  });
  frames.forEach((frame, i) => {
    const n = i + 1;
    if (frame.gas === undefined)
      throw new ErrorException(
        i < prefix
          ? `Frame ${n} is in the validation prefix and has no gas limit: give its call --gas (validation frames are never sized)`
          : `Frame ${n} has no gas limit: give its exec or send --gas (frames are not sized yet)`,
      );
    if (i >= prefix && frame.stateGas === undefined)
      throw new ErrorException(
        `Frame ${n} has no state gas limit: add --state-gas to frames:tx (frames are not sized yet)`,
      );
  });
}

export interface LayoutInput {
  actions: Action[];
  sender: Address;
  chainId: number;
  paymaster?: Address;
  paymasterData?: Hex;
  stateGas?: bigint;
  /** Execution gas of every body frame written without its own. */
  gas?: bigint;
  /** The sender is a frame account and the paymaster a sponsor: call their checks. */
  accountChecks?: boolean;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const sameTarget = (a: Address | null, b: Address | null) =>
  a === null || b === null ? a === b : same(a, b);

export function layoutFrames(input: LayoutInput): FrameSpec[] {
  const { sender, chainId } = input;
  const written: FrameSpec[] = [];
  // Indexes (into `written`) of frames that sit inside an atomic group.
  const grouped = new Set<number>();

  const toFrame = (action: TransactionAction, pos: number): FrameSpec => {
    if (action.readOnly)
      throw new ErrorException(
        `Action ${pos} is read-only: a frame transaction only carries calls that are sent, so write it as a plain call or move the read out of the block.`,
      );
    if (action.from && !same(action.from, sender))
      throw new ErrorException(
        `Action ${pos} is sent from ${action.from}, but the transaction's sender is ${sender}: a frame transaction has one sender, so drop the other sender or use \`switch --as ${sender}\`.`,
      );
    if (action.chainId !== undefined && action.chainId !== chainId)
      throw new ErrorException(
        `Action ${pos} is for chain ${action.chainId}, but the transaction is for chain ${chainId}: a frame transaction lives on one chain, so move that call out of the block.`,
      );
    if (!action.to)
      throw new ErrorException(
        `Action ${pos} has no recipient: deployments are not supported in a frame transaction, so deploy outside the block.`,
      );
    const mark = frameMarkOf(action);
    const spec: FrameSpec = {
      mode: mark?.mode ?? "sender",
      target: same(action.to, sender) ? null : action.to,
      data: action.data ?? "0x",
      value: action.value ?? 0n,
    };
    if (mark?.mode === "verify") spec.approve = mark.approve;
    if (action.gas !== undefined) spec.gas = action.gas;
    else if (spec.mode === "verify")
      spec.gas = spec.target === null ? SELF_VERIFY_GAS : PAYMASTER_VERIFY_GAS;
    return spec;
  };

  let pos = 0;
  for (const action of input.actions) {
    if ("type" in action && action.type === "batched") {
      const batch = action as BatchedAction;
      if (!same(batch.from, sender) || batch.chainId !== chainId)
        throw new ErrorException(
          `A batch (action ${pos + 1}) is for another sender or chain than the transaction: a frame transaction has one sender on one chain, so move it out of the block.`,
        );
      batch.actions.forEach((inner, i) => {
        pos++;
        const last = i === batch.actions.length - 1;
        const spec = toFrame(inner, pos);
        if (!last) {
          spec.atomic = true;
          grouped.add(written.length);
          grouped.add(written.length + 1);
        }
        written.push(spec);
      });
      continue;
    }
    pos++;
    if ("type" in action && action.type !== undefined)
      throw new ErrorException(
        `Action ${pos} is a "${action.type}" action: a frame transaction only carries calls, so move it out of the block.`,
      );
    written.push(toFrame(action as TransactionAction, pos));
  }

  const hasVerify = written.some((f) => f.mode === "verify");
  let generated: FrameSpec[] = [];
  if (input.paymaster) {
    if (hasVerify)
      throw new ErrorException(
        "A paymaster is set and the block also writes a verify frame: the paymaster option generates the verify and pay frames, so drop either the option or the written verify.",
      );
    generated = [
      {
        mode: "verify",
        approve: "execution",
        target: null,
        data: input.accountChecks ? accountCheck(2) : "0x",
        value: 0n,
        gas: input.accountChecks ? ACCOUNT_CHECK_GAS : SELF_VERIFY_GAS,
      },
      {
        mode: "verify",
        approve: "payment",
        target: input.paymaster,
        data:
          input.paymasterData ??
          (input.accountChecks ? SPONSOR_CHECK_DATA : "0x"),
        value: 0n,
        gas: PAYMASTER_VERIFY_GAS,
      },
    ];
  } else if (!hasVerify) {
    generated = [
      {
        mode: "verify",
        approve: "both",
        target: null,
        data: input.accountChecks ? accountCheck(3) : "0x",
        value: 0n,
        gas: input.accountChecks ? ACCOUNT_CHECK_GAS : SELF_VERIFY_GAS,
      },
    ];
  }
  const frames = [...generated, ...written];
  const shift = generated.length;
  const isGrouped = (i: number) => grouped.has(i - shift);

  if (frames.length > MAX_FRAMES)
    throw new ErrorException(
      `The transaction has ${frames.length} frames, but at most ${MAX_FRAMES} are allowed: split the block into several transactions.`,
    );

  // A verify at or after `from` is outside the validation prefix.
  const stray = (from: number): void => {
    for (let j = from; j < frames.length; j++) {
      if (frames[j].mode !== "verify") continue;
      throw new ErrorException(
        isGrouped(j)
          ? `Frame ${j + 1} is a verify inside an atomic group: a verify cannot be batched, so move it before the calls.`
          : `Frame ${j + 1} is a verify after the transaction's calls: verifies must come first, so move it to the start of the block.`,
      );
    }
  };

  // Validate the prefix: [pv? self_verify] or [pv? only_verify, pv? pay].
  let i = 0;
  const preVerify = (): void => {
    const f = frames[i];
    if (f?.mode !== "default") return;
    const next = frames[i + 1];
    if (next?.mode === "verify" && sameTarget(f.target, next.target)) {
      i++;
      return;
    }
    throw new ErrorException(
      `Frame ${i + 1} is a default frame in the validation prefix, but it is not the pre_verify of the verify frame after it: a pre_verify must come right before a verify and call the same target, so move it into the body or give it the verify's target.`,
    );
  };
  preVerify();
  const first = frames[i];
  if (first?.mode !== "verify") {
    stray(i);
    throw new ErrorException(
      `Frame ${i + 1} should be a verify frame: the transaction must start with the verify that approves it.`,
    );
  }
  if (first.approve === "payment")
    throw new ErrorException(
      `Frame ${i + 1} approves payment before execution: write the execution (or both) verify first.`,
    );
  if (first.target !== null)
    throw new ErrorException(
      `Frame ${i + 1} approves ${first.approve} but targets another account: only the sender can approve execution, so write \`verify @me …\`.`,
    );
  i++;
  if (first.approve === "execution") {
    preVerify();
    const pay = frames[i];
    if (pay?.mode !== "verify" || pay.approve !== "payment")
      throw new ErrorException(
        `Frame ${i + 1} should be a verify that approves payment: after an execution-only verify, write the payer's \`verify <payer> --approve payment\`.`,
      );
    i++;
  }
  const prefixLength = i;

  for (let j = 0; j < prefixLength; j++) {
    if (isGrouped(j))
      throw new ErrorException(
        `Frame ${j + 1} is in the validation prefix and in an atomic group: approvals cannot be batched, so write the verify frames outside any batch.`,
      );
  }
  stray(prefixLength);

  return frames.map((f, j) => {
    if (j >= prefixLength)
      return {
        ...f,
        gas: f.gas ?? input.gas,
        stateGas: input.stateGas ?? DEFAULT_STATE_GAS,
      };
    return f;
  });
}
