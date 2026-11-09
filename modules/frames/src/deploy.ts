import type { Action, Address, TransactionAction } from "@evmcrispr/sdk";
import { chainLabel, ErrorException } from "@evmcrispr/sdk";
import type { Hex } from "viem";
import type Frames from ".";

/** The only chain the frame contracts work on. */
export const FRAME_CHAIN_ID = 1337;
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
  const chainId = await module.getChainId();
  if (chainId !== FRAME_CHAIN_ID)
    throw new ErrorException(
      `frame accounts only work on chain ${FRAME_CHAIN_ID}, not ${chainLabel(chainId)}: switch to it first.`,
    );
  const { actionCallback } = interpreters;
  if (!actionCallback)
    throw new ErrorException(
      "this command needs an execution context with a wallet: it deploys a contract now.",
    );

  const action: TransactionAction = {
    data: initCode,
    value,
    gas: DEPLOY_GAS,
    chainId,
  };
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
      `the deployment did not succeed${status !== undefined ? ` (status ${printable(status)})` : ""}${reason !== undefined ? `: ${printable(reason)}` : ""}`,
    );
  }
  const address = receipt.contractAddress;
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address))
    throw new ErrorException("the deployment receipt has no contract address");
  return address as Address;
}
