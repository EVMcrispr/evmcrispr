// A frame transaction run in a fork: the validation prefix, then the body,
// on the backend's calls with the EIP-8141 opcodes added. The sender's own
// verify frame is impersonated, as `sim:fork --as` impersonates a sender:
// no simulation holds a signature.
import type {
  ModuleActionSimCtx,
  SimCallResult,
  SimulatedReceipt,
} from "@evmcrispr/sdk";
import {
  chainLabel,
  chargedFees,
  ErrorException,
  unpaidFeeError,
} from "@evmcrispr/sdk";
import {
  frameSignatureHash,
  newFrameTransaction,
  eip8141TracerProfile as profile,
  secp256k1Placeholder,
  toFrameRequests,
} from "@evmcrispr/viem-frames";
import { type Address, getAddress, isAddressEqual } from "viem";
import type { FrameModuleAction } from "../frame-action";
import { frameNetwork, frameNetworkNames } from "../networks";
import {
  type FrameContext,
  type FrameStatus,
  frameOpcodes,
  type SimFrame,
} from "./opcodes";

/** Execution gas of a body frame written without `--gas`. */
export const UNSIZED_GAS = 30_000_000n;

/**
 * What a frame pays to reach its target, out of its own gas, as the
 * devnets' ethrex charges it (measured on `up quick`, 2026-11-09): 100 for
 * a warm target (the sender, the entry point, a precompile, or a target an
 * earlier frame reached), 3000 for a cold one. A frame given less fails,
 * having used all of its gas.
 */
export const WARM_TARGET_GAS = 100n;
export const COLD_TARGET_GAS = 3_000n;
const PRECOMPILES = Array.from(
  { length: 0x11 },
  (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`,
);

const VERIFY = profile.frameModes.VERIFY;
const SENDER = profile.frameModes.SENDER;
const ATOMIC = profile.flagBits.ATOMIC_BATCH;
const ENTRY_POINT = getAddress(profile.entryPoint);
const MODE_NAME: Record<number, string> = {
  [profile.frameModes.DEFAULT]: "default",
  [VERIFY]: "verify",
  [SENDER]: "sender",
};

export interface FrameReceiptOut {
  status: FrameStatus;
  gasUsed: bigint;
  logs: SimCallResult["logs"];
  error?: string;
}

export async function simulateFrameAction(
  action: FrameModuleAction,
  sim: ModuleActionSimCtx,
): Promise<SimulatedReceipt> {
  // The fork's chain decides, not only the one the action was made for.
  for (const id of [action.chainId, sim.chainId])
    if (!frameNetwork(id))
      throw new ErrorException(
        `Frame transactions run on ${frameNetworkNames()}, not on ${chainLabel(id)}: fork one of them to simulate this one.`,
      );
  const sender = getAddress(action.from);
  const specs = action.data.frames;
  const requests = toFrameRequests(specs, profile);
  const unsized = new Set<number>();
  const frames: SimFrame[] = requests.map((r, i) => {
    if (specs[i]!.gas === undefined) unsized.add(i);
    return {
      mode: r.mode,
      flags: r.flags,
      target: r.target ? getAddress(r.target) : sender,
      data: r.data,
      value: r.value,
      gas: specs[i]!.gas ?? UNSIZED_GAS,
      stateGas: specs[i]!.stateGas ?? 0n,
    };
  });
  const nonce = await sim.getNonce(sender);
  // The fees `frames:tx` was given, held to the fork's base fee; without
  // them the transaction runs free, as any transaction in a fork does.
  const fees = chargedFees(action.data.fees ?? {}, sim.baseFee);
  const maxFeePerGas = fees?.maxFeePerGas ?? 0n;
  const maxPriorityFeePerGas = fees?.maxPriorityFeePerGas ?? 0n;
  const unsigned = newFrameTransaction({
    chainId: action.chainId,
    sender,
    nonceSeq: nonce,
    frames: frames.map((f, i) => ({
      mode: f.mode,
      flags: f.flags,
      target: requests[i]!.target,
      limits: { execution: f.gas, state: f.stateGas },
      value: f.value,
      data: f.data,
    })),
    signatures: [secp256k1Placeholder(profile)],
    fees: { maxFeePerGas, maxPriorityFeePerGas },
  });
  const ctx: FrameContext = {
    sender,
    nonce,
    maxFeePerGas,
    maxPriorityFeePerGas,
    sigHash: frameSignatureHash(profile, unsigned),
    frames,
    current: -1,
    statuses: [],
    gasUsed: [],
    signature: {
      scheme: profile.sigSchemes.SECP256K1,
      signer: action.data.account?.owner ?? sender,
      data: `0x${"00".repeat(65)}`,
    },
  };
  const out: FrameReceiptOut[] = [];
  const name = (i: number) => {
    const f = frames[i]!;
    return `frame ${i + 1} (${MODE_NAME[f.mode] ?? `mode ${f.mode}`} to ${f.target})`;
  };
  // Warm from the start, as in any transaction; the rest is what the
  // host saw this action's earlier frames reach (inner calls included).
  const alwaysWarm = new Set(
    [sender, ENTRY_POINT, ...PRECOMPILES].map((a) => a.toLowerCase()),
  );
  const runFrame = async (i: number): Promise<SimCallResult> => {
    const f = frames[i]!;
    ctx.current = i;
    ctx.approved = undefined;
    const target = f.target.toLowerCase();
    const access =
      alwaysWarm.has(target) || sim.isWarm(f.target)
        ? WARM_TARGET_GAS
        : COLD_TARGET_GAS;
    sim.warm(f.target);
    if (f.gas < access)
      return {
        success: false,
        returnData: "0x",
        gasUsed: f.gas,
        logs: [],
        error: "out of gas reaching the frame's target",
      };
    const result = await sim.call({
      caller: f.mode === SENDER ? sender : ENTRY_POINT,
      to: f.target,
      data: f.data,
      value: f.value,
      gas: f.gas - access,
      isStatic: f.mode === VERIFY,
    });
    return { ...result, gasUsed: access + result.gasUsed };
  };

  return sim.withOpcodes(frameOpcodes(ctx), async () => {
    let prefix = 0;
    frames.forEach((f, i) => {
      if (f.mode === VERIFY) prefix = i + 1;
    });
    let execution = false;
    let payer: Address | undefined;

    // Every checkpoint opened, so that an error unwinds all of them.
    let open = 0;
    const checkpoint = async () => {
      await sim.checkpoint();
      open++;
    };
    const commit = async () => {
      await sim.commit();
      open--;
    };
    const revert = async () => {
      await sim.revert();
      open--;
    };

    await checkpoint();
    try {
      // 1. Validation: every frame must succeed; a verify frame must approve.
      for (let i = 0; i < prefix; i++) {
        const f = frames[i]!;
        let approved: number | undefined;
        if (f.mode === VERIFY && isAddressEqual(f.target, sender)) {
          approved = f.flags & 3;
          ctx.statuses[i] = "impersonated";
          ctx.gasUsed[i] = 0n;
          out.push({ status: "impersonated", gasUsed: 0n, logs: [] });
        } else {
          const result = await runFrame(i);
          if (!result.success)
            throw new ErrorException(
              `The frame transaction is invalid: ${name(i)} failed (${result.error ?? "reverted"}), so nothing of it runs.`,
            );
          if (f.mode === VERIFY && ctx.approved === undefined)
            throw new ErrorException(
              `The frame transaction is invalid: ${name(i)} ended without APPROVE, so nothing of it runs.`,
            );
          approved = f.mode === VERIFY ? ctx.approved : undefined;
          ctx.statuses[i] = "success";
          ctx.gasUsed[i] = result.gasUsed;
          out.push({
            status: "success",
            gasUsed: result.gasUsed,
            logs: result.logs,
          });
        }
        if (approved !== undefined) {
          if (approved & profile.approveScopes.EXECUTION) execution = true;
          if (approved & profile.approveScopes.PAYMENT) payer ??= f.target;
        }
      }
      if (!execution)
        throw new ErrorException(
          "The frame transaction is invalid: no verify frame approved its execution for the sender.",
        );
      if (!payer)
        throw new ErrorException(
          "The frame transaction is invalid: no verify frame approved paying for it.",
        );
      // The transaction uses the sender's nonce once validated; what its
      // body creates moves the nonce on from there.
      await sim.setNonce(sender, (await sim.getNonce(sender)) + 1n);

      // 2. The body: a failed frame does not stop the next ones, unless it
      //    is in an atomic group, which rolls back as a whole.
      for (let i = prefix; i < frames.length; ) {
        let end = i;
        while (end < frames.length - 1 && frames[end]!.flags & ATOMIC) end++;
        await checkpoint();
        const group: number[] = [];
        let failed: number | undefined;
        for (let j = i; j <= end; j++) {
          const result = await runFrame(j);
          group.push(j);
          ctx.gasUsed[j] = result.gasUsed;
          out[j] = {
            status: result.success ? "success" : "reverted",
            gasUsed: result.gasUsed,
            logs: result.success ? result.logs : [],
            error: result.error,
          };
          ctx.statuses[j] = out[j]!.status;
          if (!result.success) {
            failed = j;
            break;
          }
        }
        if (failed === undefined) await commit();
        else {
          await revert();
          // The group's earlier frames are rolled back with it.
          for (const j of group)
            if (j !== failed) {
              out[j] = { ...out[j]!, status: "reverted", logs: [] };
              ctx.statuses[j] = "reverted";
            }
          for (let j = failed + 1; j <= end; j++) {
            out[j] = { status: "skipped", gasUsed: 0n, logs: [] };
            ctx.statuses[j] = "skipped";
          }
        }
        i = end + 1;
      }

      // 3. The fee: what the frames' gas used costs, taken from the payer.
      //    One that cannot pay it makes the whole transaction invalid.
      if (fees) {
        const fee = out.reduce((sum, f) => sum + f.gasUsed, 0n) * fees.gasPrice;
        const balance = await sim.getBalance(payer);
        if (balance < fee)
          throw new ErrorException(
            `The frame transaction is invalid: ${unpaidFeeError(sim.chainId, payer, fee, balance).message}`,
          );
        await sim.setBalance(payer, balance - fee);
      }

      await commit();
    } catch (error) {
      while (open > 0) await revert();
      throw error;
    }

    for (const [i, frame] of out.entries()) {
      if (frame.status !== "success" && frame.status !== "impersonated")
        sim.onLog(
          `:warning:Frame ${i + 1} ${frame.status}${frame.error ? ` (${frame.error})` : ""}`,
        );
      if (unsized.has(i) && i >= prefix)
        sim.onLog(
          `Frame ${i + 1} used ${frame.gasUsed} gas: give its call --gas ${(frame.gasUsed * 5n) / 4n + 5_000n} to send it`,
        );
    }
    let logIndex = 0;
    return {
      status: "success",
      transactionHash: sim.transactionHash,
      gasUsed: out.reduce((sum, f) => sum + f.gasUsed, 0n),
      logs: out.flatMap((f) =>
        f.logs.map((log) => ({ ...log, logIndex: logIndex++ })),
      ),
      payer,
      frameReceipts: out,
    };
  });
}
