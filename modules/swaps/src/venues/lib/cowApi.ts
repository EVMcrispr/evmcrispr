import { chainLabel, ErrorException } from "@evmcrispr/sdk";
import type { Address } from "viem";

export const COW_SETTLEMENT: Address =
  "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";
export const COW_VAULT_RELAYER: Address =
  "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110";
/** Order sentinel for buying the native token (the settlement unwraps). */
export const COW_NATIVE_BUY: Address =
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

/** Orderbook network slugs per chain id. */
export const COW_NETWORKS: Record<number, string> = {
  1: "mainnet",
  100: "xdai",
  137: "polygon",
  8453: "base",
  42161: "arbitrum_one",
};

const ZERO_APP_DATA =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

export interface CowQuote {
  sellToken: Address;
  buyToken: Address;
  receiver: Address;
  sellAmount: string;
  buyAmount: string;
  validTo: number;
  appData: string;
  feeAmount: string;
  kind: "sell" | "buy";
  partiallyFillable: boolean;
  sellTokenBalance: string;
  buyTokenBalance: string;
}

/** The final order: quote fields with the fee folded into sellAmount
 *  (CoW rejects orders with a nonzero feeAmount) and our own limit. */
export interface CowOrder {
  sellToken: Address;
  buyToken: Address;
  receiver: Address;
  sellAmount: bigint;
  buyAmount: bigint;
  validTo: number;
  appData: string;
  feeAmount: bigint;
  kind: "sell" | "buy";
  partiallyFillable: boolean;
  sellTokenBalance: string;
  buyTokenBalance: string;
}

function baseUrl(chainId: number): string {
  const network = COW_NETWORKS[chainId];
  if (!network) {
    throw new ErrorException(
      `CoWSwap is not available on ${chainLabel(chainId)}`,
    );
  }
  return `https://api.cow.fi/${network}/api/v1`;
}

async function post(url: string, body: unknown): Promise<Response> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new ErrorException(
      `CoWSwap request failed: ${err instanceof Error ? err.message : err}`,
    );
  }
}

export async function fetchCowQuote(
  chainId: number,
  params: {
    sellToken: Address;
    buyToken: Address;
    from: Address;
    receiver: Address;
    kind: "sell" | "buy";
    amount: bigint;
    validTo: number;
  },
): Promise<CowQuote> {
  const res = await post(`${baseUrl(chainId)}/quote`, {
    sellToken: params.sellToken,
    buyToken: params.buyToken,
    from: params.from,
    receiver: params.receiver,
    kind: params.kind,
    ...(params.kind === "sell"
      ? { sellAmountBeforeFee: params.amount.toString() }
      : { buyAmountAfterFee: params.amount.toString() }),
    validTo: params.validTo,
    signingScheme: "eip712",
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new ErrorException(
      `CoWSwap quote failed (HTTP ${res.status}): ${body}`,
    );
  }
  const { quote } = (await res.json()) as { quote: CowQuote };
  return quote;
}

export function buildOrderTypedData(chainId: number, order: CowOrder): string {
  return JSON.stringify({
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Order: [
        { name: "sellToken", type: "address" },
        { name: "buyToken", type: "address" },
        { name: "receiver", type: "address" },
        { name: "sellAmount", type: "uint256" },
        { name: "buyAmount", type: "uint256" },
        { name: "validTo", type: "uint32" },
        { name: "appData", type: "bytes32" },
        { name: "feeAmount", type: "uint256" },
        { name: "kind", type: "string" },
        { name: "partiallyFillable", type: "bool" },
        { name: "sellTokenBalance", type: "string" },
        { name: "buyTokenBalance", type: "string" },
      ],
    },
    primaryType: "Order",
    domain: {
      name: "Gnosis Protocol",
      version: "v2",
      chainId,
      verifyingContract: COW_SETTLEMENT,
    },
    message: {
      sellToken: order.sellToken,
      buyToken: order.buyToken,
      receiver: order.receiver,
      sellAmount: order.sellAmount.toString(),
      buyAmount: order.buyAmount.toString(),
      validTo: order.validTo,
      appData: order.appData || ZERO_APP_DATA,
      feeAmount: order.feeAmount.toString(),
      kind: order.kind,
      partiallyFillable: order.partiallyFillable,
      sellTokenBalance: order.sellTokenBalance,
      buyTokenBalance: order.buyTokenBalance,
    },
  });
}

export async function postOrder(
  chainId: number,
  order: CowOrder,
  from: Address,
  signature: `0x${string}`,
): Promise<string> {
  const res = await post(`${baseUrl(chainId)}/orders`, {
    sellToken: order.sellToken,
    buyToken: order.buyToken,
    receiver: order.receiver,
    sellAmount: order.sellAmount.toString(),
    buyAmount: order.buyAmount.toString(),
    validTo: order.validTo,
    appData: order.appData || ZERO_APP_DATA,
    feeAmount: order.feeAmount.toString(),
    kind: order.kind,
    partiallyFillable: order.partiallyFillable,
    sellTokenBalance: order.sellTokenBalance,
    buyTokenBalance: order.buyTokenBalance,
    signingScheme: "eip712",
    signature,
    from,
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new ErrorException(
      `CoWSwap order rejected (HTTP ${res.status}): ${body}`,
    );
  }
  return (await res.json()) as string;
}

const EXPLORER_PREFIXES: Record<number, string> = {
  1: "",
  100: "gc/",
  137: "pol/",
  8453: "base/",
  42161: "arb1/",
};

export function explorerLink(chainId: number, orderUid: string): string {
  return `https://explorer.cow.fi/${EXPLORER_PREFIXES[chainId] ?? ""}orders/${orderUid}`;
}
