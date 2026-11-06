import type { ActionHandlers } from "@evmcrispr/core";
import { chainLabel, type FrameSpec } from "@evmcrispr/sdk";
import {
  ATOMIC_BATCH_FLAG,
  altMempoolActions,
  altMempoolDevnet,
  eip8141TracerProfile,
  type FrameRequest,
  frameSimulationUrlOf,
} from "@evmcrispr/viem-frames";
import {
  createWalletClient,
  type Hash,
  http,
  isAddressEqual,
  publicActions,
  type Transport,
  WaitForTransactionReceiptTimeoutError,
} from "viem";
import type { ConfirmingAccount } from "./local-signer";

const EXPLORER = "https://explorer.altmempool.wtf";
const NETWORK = altMempoolDevnet.name;

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
export function prefixLength(frames: FrameSpec[]): number {
  let last = -1;
  frames.forEach((f, i) => {
    if (f.mode === "verify") last = i;
  });
  return last + 1;
}

/**
 * The frames of a `FrameAction` as viem-frames lays them out. A
 * validation-prefix frame carries its own limits (`gas`, state 0): nothing
 * sizes it. A body frame carries limits only when it has both `gas` and
 * `stateGas`; otherwise they are left for preparing to size.
 */
export function toFrameRequests(frames: FrameSpec[]): FrameRequest[] {
  const profile = eip8141TracerProfile;
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

/** Why a frame cannot be sent as written, numbered as frame:tx numbers
 *  frames (from 1); undefined when it can (sizing as allowed). */
function missingLimit(
  frame: FrameSpec,
  i: number,
  inPrefix: boolean,
  sizeBySimulation: boolean,
): string | undefined {
  const n = i + 1;
  if (inPrefix)
    return frame.gas === undefined
      ? `Frame ${n} is in the validation prefix and has no gas limit: add --gas to it (validation frames are never sized)`
      : undefined;
  if (sizeBySimulation) return undefined;
  if (frame.gas === undefined)
    return `Frame ${n} has no gas limit: add --gas to it, or run with --size-by-simulation`;
  if (frame.stateGas === undefined)
    return `Frame ${n} has no state gas limit: add --state-gas to frame:tx, or run with --size-by-simulation`;
  return undefined;
}

const networkName = (chainId: number) =>
  chainId === altMempoolDevnet.id ? NETWORK : chainLabel(chainId);

/**
 * The CLI's handler of frame transactions: signs them with the local key
 * (every signature confirmed) and sends them to the alt mempool of the
 * devnet, through its gateway. Without `sizeBySimulation`, every frame must
 * carry its limits, so nothing but the transaction as sent is ever signed;
 * with it, the provisional transaction that sizes them is signed (and
 * confirmed) first, labelled as such.
 */
export function makeFrameHandler({
  account,
  sizeBySimulation,
  receiptTimeoutMs = 120_000,
  transport,
}: {
  account: ConfirmingAccount;
  sizeBySimulation: boolean;
  receiptTimeoutMs?: number;
  /** Stands in for the gateway in tests. */
  transport?: Transport;
}): ActionHandlers["frame"] {
  return async (action, ctx) => {
    if (action.chainId !== altMempoolDevnet.id)
      throw new Error(
        `Frame transactions are sent only on the ${NETWORK} (chain ${altMempoolDevnet.id}), not on ${chainLabel(action.chainId)}`,
      );
    if (!isAddressEqual(action.from, account.address))
      throw new Error(
        `This frame transaction is from ${action.from}, but the local key is ${account.address}: only the local key's own frame transactions can be signed`,
      );
    const prefix = prefixLength(action.frames);
    action.frames.forEach((frame, i) => {
      const missing = missingLimit(frame, i, i < prefix, sizeBySimulation);
      if (missing) throw new Error(missing);
    });

    const client = createWalletClient({
      account,
      chain: altMempoolDevnet,
      transport: transport ?? http(),
    })
      .extend(publicActions)
      .extend(altMempoolActions());

    // The only place a provisional signature can happen.
    const prepared = (await account.labelled(
      `Provisional transaction for gas sizing, sent to ${frameSimulationUrlOf(altMempoolDevnet)} only`,
      () =>
        client.prepareFrameTransaction({
          frames: toFrameRequests(action.frames),
          sizeBySimulation,
        }),
    )) as unknown as {
      frames: FrameRequest[];
      nonce: number;
      maxFeePerGas: bigint;
      maxPriorityFeePerGas: bigint;
    };

    action.frames.forEach((frame, i) => {
      if (
        i >= prefix &&
        frame.gas !== undefined &&
        frame.stateGas === undefined
      )
        ctx.onLog(
          `:warning:Frame ${i + 1}'s --gas ${frame.gas} was replaced by the sized limit ${prepared.frames[i]?.limits?.execution} (it had no state gas limit)`,
        );
    });

    // Every frame has its limits now: sending sizes nothing, so the one
    // signature it asks for is over the transaction exactly as sent.
    const hash = await client.sendFrameTransaction({
      frames: prepared.frames,
      nonce: prepared.nonce,
      maxFeePerGas: prepared.maxFeePerGas,
      maxPriorityFeePerGas: prepared.maxPriorityFeePerGas,
      mempool: action.mempool,
    });
    ctx.onSent?.(hash);
    const status = async () =>
      (await client.getFrameTransactionStatus(hash).catch(() => undefined))
        ?.status ?? "unknown";
    ctx.onLog(
      `:success:Frame transaction ${hash} admitted to the ${action.mempool} mempool of the ${networkName(action.chainId)} (status ${await status()})`,
    );

    let receipt: Awaited<ReturnType<typeof client.waitForTransactionReceipt>>;
    try {
      receipt = await client.waitForTransactionReceipt({
        hash: hash as Hash,
        timeout: receiptTimeoutMs,
      });
    } catch (error) {
      if (error instanceof WaitForTransactionReceiptTimeoutError)
        throw new Error(
          `${hash} was admitted but not mined within 2 minutes (status ${await status()}): stopping, since a later transaction from you would reuse its nonce. ${EXPLORER}`,
        );
      throw error;
    }
    const { payer, frameReceipts } = receipt as typeof receipt & {
      payer?: string;
      frameReceipts?: { status: string }[];
    };
    ctx.onLog(
      `:success:Frame transaction ${hash} mined in block ${receipt.blockNumber}, paid by ${payer ?? "an unknown payer"}`,
    );
    frameReceipts?.forEach((frame, i) => {
      ctx.onLog(
        `${frame.status === "success" ? ":success:" : ":warning:"}Frame ${i + 1}: ${frame.status}`,
      );
    });
    return receipt;
  };
}
