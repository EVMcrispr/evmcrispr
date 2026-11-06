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

/** The frames of a `FrameAction` as viem-frames lays them out. Limits are
 *  set only for a frame that has `gas`; the rest are sized when prepared. */
export function toFrameRequests(frames: FrameSpec[]): FrameRequest[] {
  const profile = eip8141TracerProfile;
  return frames.map((frame) => {
    const mode = profile.frameModes[MODES[frame.mode]];
    if (mode === undefined)
      throw new Error(`The frame profile has no ${frame.mode} mode`);
    const scope = frame.approve
      ? profile.approveScopes[SCOPES[frame.approve]]
      : 0;
    if (scope === undefined)
      throw new Error(`The frame profile has no ${frame.approve} scope`);
    return {
      mode,
      flags: scope | (frame.atomic ? ATOMIC_BATCH_FLAG : 0),
      target: frame.target,
      limits:
        frame.gas === undefined
          ? undefined
          : { execution: frame.gas, state: frame.stateGas ?? 0n },
      value: frame.value,
      data: frame.data,
    };
  });
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
    if (!sizeBySimulation)
      action.frames.forEach((frame, i) => {
        if (
          frame.gas === undefined ||
          (frame.mode !== "verify" && frame.stateGas === undefined)
        )
          throw new Error(
            `Frame ${i} has no gas limit: add --gas to it and --state-gas to frame:tx, or run with --size-by-simulation`,
          );
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
        `${frame.status === "success" ? ":success:" : ":warning:"}Frame ${i}: ${frame.status}`,
      );
    });
    return receipt;
  };
}
