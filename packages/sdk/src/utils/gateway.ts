import type { Address, Hex } from "viem";
import { registeredChain } from "./chains";

/** The chain's gateway (see `ChainDef.gateway`), if a module declared one. */
export function chainGateway(chainId: number): string | undefined {
  return registeredChain(chainId)?.gateway;
}

/** Ceiling on what a quote may commit a transaction to when the chain
 *  declares none: 0.01 of the native token, about twenty times what an EEZ
 *  composer charges for settlement. A quote is network input, and a local
 *  key signs it without anyone looking. */
export const DEFAULT_GATEWAY_MAX_FEE = 10n ** 16n;

/** The chain's ceiling on a quoted transaction's maximum fee, in wei. */
export function chainGatewayMaxFee(chainId: number): bigint {
  const declared = registeredChain(chainId)?.gatewayMaxFee;
  return declared !== undefined && /^\d+$/.test(declared)
    ? BigInt(declared)
    : DEFAULT_GATEWAY_MAX_FEE;
}

/** Largest gas limit a quote may set: an EEZ composer's own bound. */
const MAX_QUOTED_GAS = 16_777_216n;

export interface GatewayQuote {
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

/** Why a gateway would not price a transaction, in its own words. */
export interface GatewayRefusal {
  refused: string;
}

/** Headroom on the quoted fees: they are priced against the head the
 *  gateway sees now, and the wallet may send a while later. */
const FEE_HEADROOM_PERCENT = 125n;

const hex = (n: bigint): Hex => `0x${n.toString(16)}`;

/**
 * Ask a gateway what a transaction costs (`eez_quoteFee`, an EEZ composer's
 * compact fee quote). A transaction that crosses chains pays for its
 * settlement through its priority fee, and the composer refuses one priced
 * below its tariff; it composes the transaction and answers with the gas
 * and fees it admits.
 *
 * A refusal when the gateway will not price this transaction: an ordinary
 * single-chain one (nothing to price), or one that would fail once
 * composed, or whose sender lacks funds. Undefined when the gateway cannot
 * be reached. Either way the transaction goes out as it would have; a
 * cross-chain one is then refused by the gateway, and the refusal says
 * why.
 */
export async function quoteThroughGateway(
  url: string,
  chainId: number,
  tx: { from: Address; to: Address; data?: Hex; value?: bigint; gas?: bigint },
  signal?: AbortSignal,
): Promise<GatewayQuote | GatewayRefusal | undefined> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eez_quoteFee",
        params: [
          {
            type: "0x2",
            chainId: hex(BigInt(chainId)),
            from: tx.from,
            to: tx.to,
            value: hex(tx.value ?? 0n),
            data: tx.data ?? "0x",
            ...(tx.gas !== undefined ? { gas: hex(tx.gas) } : {}),
          },
          { transactionTypes: ["0x2"] },
        ],
      }),
      signal,
    });
    const json = (await res.json()) as {
      error?: { message?: string };
      result?: {
        options?: {
          type: string;
          gas?: Hex;
          maxFeePerGas?: Hex;
          maxPriorityFeePerGas?: Hex;
          error?: { message?: string; code?: string };
        }[];
      };
    };
    if (json.error) return { refused: json.error.message ?? "no quote" };
    const option = json.result?.options?.find((o) => o.type === "0x2");
    if (!option) return undefined;
    if (option.error)
      return {
        refused: option.error.message ?? option.error.code ?? "no quote",
      };
    if (!option.gas || !option.maxFeePerGas) return undefined;
    // The quote is network input: it never raises the gas the transaction
    // set, stays within the gateway's own gas bound, and commits the
    // transaction to no more than this chain's ceiling.
    const gas = BigInt(option.gas);
    if (gas > MAX_QUOTED_GAS || (tx.gas !== undefined && gas > tx.gas))
      return {
        refused: `the gateway quoted a gas limit of ${gas}, above the ${tx.gas ?? MAX_QUOTED_GAS} it may set`,
      };
    const bump = (v: Hex) => (BigInt(v) * FEE_HEADROOM_PERCENT) / 100n;
    const maxPriorityFeePerGas = bump(option.maxPriorityFeePerGas ?? "0x0");
    const bumped = bump(option.maxFeePerGas);
    const maxFeePerGas =
      bumped > maxPriorityFeePerGas ? bumped : maxPriorityFeePerGas;
    // Checked against the gas the transaction will be signed with: its
    // own when it set one (a quote never raises it), else the quote's.
    const ceiling = chainGatewayMaxFee(chainId);
    const signedGas = tx.gas ?? gas;
    if (signedGas * maxFeePerGas > ceiling)
      return {
        refused: `the gateway quoted up to ${signedGas * maxFeePerGas} wei, above this chain's ceiling of ${ceiling}`,
      };
    return { gas, maxFeePerGas, maxPriorityFeePerGas };
  } catch (err) {
    if (signal?.aborted) throw err;
    return undefined;
  }
}
