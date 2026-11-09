import type { Action, Address, TransactionAction } from "@evmcrispr/sdk";
import { chainLabel, ErrorException } from "@evmcrispr/sdk";
import type { Hex } from "viem";
import type Frames from ".";
import { chains } from "./chains";

/**
 * The chains the frame contracts work on: the public alt-mempool devnet
 * (1337) and the two local devnets of scripts/frame-devnet.ts (`framesQuick`,
 * `framesMining`; see chains.ts).
 */
export const FRAME_CHAIN_IDS: readonly number[] = [
  1337,
  ...chains.map((c) => c.id),
];
export const DEPLOY_GAS = 6_000_000n;

const HASH = /^0x[0-9a-fA-F]{64}$/;
// Control and bidi characters a host could slip into text (the set
// viem-frames' printable escapes; the module does not depend on it).
const UNSAFE =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const printable = (v: unknown) => String(v).replace(UNSAFE, "").slice(0, 200);

interface Receipt {
  reason?: unknown;
  status?: unknown;
  contractAddress?: unknown;
}

interface Interpreters {
  actionCallback?: (action: Action) => Promise<unknown>;
}

/** The current chain, refused unless the frame contracts work on it. */
export async function frameChainId(module: Frames): Promise<number> {
  const chainId = await module.getChainId();
  if (!FRAME_CHAIN_IDS.includes(chainId))
    throw new ErrorException(
      `frame accounts only work on the alt-mempool devnet, ${chains.map((c) => `the ${c.name}`).join(" and ")}, not ${chainLabel(chainId)}: switch to one first.`,
    );
  return chainId;
}

/**
 * The current chain, refused unless transactions sent on it are mined: a
 * frame chain other than the quick devnet, which admits transactions but
 * never includes them.
 */
export async function sendingChainId(module: Frames): Promise<number> {
  const chainId = await frameChainId(module);
  const quick = chains.find((c) => c.key === "framesQuick");
  if (chainId === quick?.id)
    throw new ErrorException(
      `the ${quick.name} never mines: a transaction sent on it is never included. Send on the Frames mining devnet instead ("switch framesMining").`,
    );
  return chainId;
}

/**
 * Deploy creation code inline, now, through the host's wallet, and return the
 * address the receipt names (never a predicted one).
 */
export async function deployInline(
  module: Frames,
  interpreters: Interpreters,
  initCode: Hex,
  value = 0n,
): Promise<Address> {
  const chainId = await sendingChainId(module);
  const receipt = await sendInline(module, interpreters, {
    data: initCode,
    value,
    gas: DEPLOY_GAS,
    chainId,
  });
  const address = receipt.contractAddress;
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address))
    throw new ErrorException("the deployment receipt has no contract address");
  return address as Address;
}

/** Send one transaction now, through the host's wallet; its receipt, refused unless it succeeded. */
export async function sendInline(
  module: Frames,
  interpreters: Interpreters,
  action: TransactionAction,
): Promise<Receipt> {
  const { actionCallback } = interpreters;
  if (!actionCallback)
    throw new ErrorException(
      "this command needs an execution context with a wallet: it sends a transaction now.",
    );
  const result = await actionCallback(action);

  let receipt: Receipt | undefined;
  if (typeof result === "string") {
    if (!HASH.test(result))
      throw new ErrorException(
        "the wallet answered with something that is not a transaction hash",
      );
    const client = await module.getClient();
    receipt = await client.waitForTransactionReceipt({ hash: result as Hex });
  } else if (result && typeof result === "object") {
    const hash = (result as { transactionHash?: unknown }).transactionHash;
    if (!("status" in result) && typeof hash === "string" && HASH.test(hash)) {
      const client = await module.getClient();
      receipt = await client.waitForTransactionReceipt({ hash: hash as Hex });
    } else receipt = result as Receipt;
  }

  if (receipt?.status !== "success") {
    const status = receipt?.status;
    const reason = receipt?.reason;
    throw new ErrorException(
      `the ${action.to ? "transaction" : "deployment"} did not succeed${status !== undefined ? ` (status ${printable(status)})` : ""}${reason !== undefined ? `: ${printable(reason)}` : ""}`,
    );
  }
  return receipt;
}
