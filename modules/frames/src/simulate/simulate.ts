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
  frameProfileOf,
  frameSignatureHash,
  newFrameTransaction,
  secp256k1Placeholder,
  toFrameRequests,
} from "@evmcrispr/viem-frames";
import { type Address, getAddress, isAddressEqual } from "viem";
import type { FrameModuleAction } from "../frame-action";
import { frameNetwork, frameNetworkNames } from "../networks";
import { frameIntrinsicGas } from "./intrinsic";
import {
  type FrameContext,
  type FrameStatus,
  frameOpcodes,
  type SimFrame,
} from "./opcodes";
import { buildTrace } from "./trace";

/** Execution gas of a body frame written without `--gas`. */
export const UNSIZED_GAS = 30_000_000n;

// What a frame pays to reach its target, and whether a codeless one is
// free, are the network's (`FrameGasRules` in networks.ts). Warm from the
// start: the sender, the entry point and the precompiles.
const PRECOMPILES = Array.from(
  { length: 0x11 },
  (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`,
);

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
  // The fork's network: its client's numbers and how it charges gas.
  const network = frameNetwork(sim.chainId)!;
  const profile = frameProfileOf(network.chain);
  const VERIFY = profile.frameModes.VERIFY!;
  const SENDER = profile.frameModes.SENDER!;
  const POST_TX = profile.frameModes.POST_TX;
  const ATOMIC = profile.flagBits.ATOMIC_BATCH ?? 0;
  const ENTRY_POINT = getAddress(profile.entryPoint);
  const MODE_NAME: Record<number, string> = {
    [profile.frameModes.DEFAULT!]: "default",
    [VERIFY]: "verify",
    [SENDER]: "sender",
  };
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
  /** What the payer is charged when it approves: none without fees, and
   *  none when a frame has no gas limit to price. */
  const preCharged =
    fees && network.gas.preCharge && unsized.size === 0
      ? fees.maxFeePerGas *
        (frameIntrinsicGas(
          requests.map((r, i) => ({
            target: r.target ? getAddress(r.target) : null,
            data: r.data,
            value: frames[i]!.value,
          })),
          sender,
          network.gas.preCharge.intrinsicExtra,
        ) +
          frames.reduce((sum, f) => sum + f.gas + f.stateGas, 0n))
      : undefined;
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
    profile,
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
  const precompiles = new Set(PRECOMPILES);
  const runFrame = async (i: number): Promise<SimCallResult> => {
    const f = frames[i]!;
    ctx.current = i;
    ctx.approved = undefined;
    const target = f.target.toLowerCase();
    // A network that charges a codeless or precompile frame to the
    // transaction runs it unbounded and counts none of its gas.
    if (
      network.gas.codelessFramesFree &&
      (precompiles.has(target) || (await sim.getCode(f.target)) === "0x")
    ) {
      sim.warm(f.target);
      const result = await sim.call({
        caller: f.mode === SENDER ? sender : ENTRY_POINT,
        to: f.target,
        data: f.data,
        value: f.value,
        gas: UNSIZED_GAS,
        isStatic: f.mode === VERIFY || f.mode === POST_TX,
        transferLogs: network.gas.transferLogs,
      });
      return { ...result, gasUsed: 0n };
    }
    const { warm, cold } = network.gas.targetAccess;
    const access = alwaysWarm.has(target) || sim.isWarm(f.target) ? warm : cold;
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
      isStatic: f.mode === VERIFY || f.mode === POST_TX,
      transferLogs: network.gas.transferLogs,
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
    /** The first POST_TX frame that failed, if one did. */
    let failedCheck: number | undefined;

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
      // The payer's approval collects the most the transaction can cost
      // (EIP-8141's max_cost), on a network that charges it then: frames
      // that read the payer's balance, a POST_TX frame's trace included,
      // see it charged. The unused part comes back after the last frame.
      if (preCharged !== undefined) {
        const balance = await sim.getBalance(payer);
        if (balance < preCharged)
          throw new ErrorException(
            `The frame transaction is invalid: ${unpaidFeeError(sim.chainId, payer, preCharged, balance, "its gas limits cost up to").message}`,
          );
        await sim.setBalance(payer, balance - preCharged);
      }
      // The transaction uses the sender's nonce once validated; what its
      // body creates moves the nonce on from there.
      await sim.setNonce(sender, (await sim.getNonce(sender)) + 1n);

      // POST_TX frames (post-verify) are the transaction's last frames.
      let bodyEnd = frames.length;
      while (bodyEnd > prefix && frames[bodyEnd - 1]!.mode === POST_TX)
        bodyEnd--;

      // 2. The body: a failed frame does not stop the next ones, unless it
      //    is in an atomic group, which rolls back as a whole. A failing
      //    POST_TX frame reverts all of it: its checkpoint is the body's.
      await checkpoint();
      for (let i = prefix; i < bodyEnd; ) {
        let end = i;
        while (end < bodyEnd - 1 && frames[end]!.flags & ATOMIC) end++;
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

      // 3. The checks: POST_TX frames read what the body did (TXTRACE),
      //    as static calls by the entry point. The first that fails reverts
      //    the body; the checks after it do not run. The transaction stays:
      //    the validation prefix and the fee are kept (measured on Hegota).
      if (bodyEnd < frames.length) {
        ctx.trace = buildTrace(
          await sim.stateChanges(),
          out.slice(0, bodyEnd).flatMap((f) => f.logs),
        );
        for (let j = bodyEnd; j < frames.length; j++) {
          if (failedCheck !== undefined) {
            out[j] = { status: "skipped", gasUsed: 0n, logs: [] };
            ctx.statuses[j] = "skipped";
            continue;
          }
          const result = await runFrame(j);
          ctx.gasUsed[j] = result.gasUsed;
          out[j] = {
            status: result.success ? "success" : "reverted",
            gasUsed: result.gasUsed,
            logs: [],
            error: result.error,
          };
          ctx.statuses[j] = out[j]!.status;
          if (!result.success) failedCheck = j;
        }
      }
      if (failedCheck === undefined) await commit();
      else {
        await revert();
        // What the body emitted never happened.
        for (let j = prefix; j < bodyEnd; j++)
          if (out[j]) out[j] = { ...out[j]!, logs: [] };
      }

      // 4. The fee: what the frames' gas used costs, taken from the payer
      //    (the pre-charge, less the fee, comes back). One that cannot pay
      //    it makes the whole transaction invalid.
      if (fees) {
        const fee = out.reduce((sum, f) => sum + f.gasUsed, 0n) * fees.gasPrice;
        const balance = await sim.getBalance(payer);
        if (preCharged !== undefined)
          await sim.setBalance(payer, balance + preCharged - fee);
        else if (balance < fee)
          throw new ErrorException(
            `The frame transaction is invalid: ${unpaidFeeError(sim.chainId, payer, fee, balance).message}`,
          );
        else await sim.setBalance(payer, balance - fee);
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
    // Mined, its body reverted: the run stops here, as a send would.
    if (failedCheck !== undefined)
      throw new ErrorException(
        `A post-verify check failed: post-verify frame ${failedCheck + 1} reverted, so the transaction's body was reverted (${sim.transactionHash})`,
      );
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
