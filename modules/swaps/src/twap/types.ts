import type { Module, TransactionAction } from "@evmcrispr/sdk";
import type { Address, Hex, PublicClient } from "viem";
import type { ObservationBlock } from "./evidence";

export interface ConditionalOrderParams {
  handler: Address;
  salt: Hex;
  staticInput: Hex;
}

export interface TwapSchedule {
  sellToken: Address;
  buyToken: Address;
  receiver: Address;
  partSellAmount: bigint;
  minPartLimit: bigint;
  t0: bigint;
  n: bigint;
  t: bigint;
  span: bigint;
  appData: Hex;
}

/** JSON-safe, portable reference. No mutable lifecycle state is trusted here. */
export interface TwapReference {
  version: 1;
  provider: "CoWSwap";
  chainId: number;
  controller: Address;
  account: Address;
  slot: number;
  params: ConditionalOrderParams;
  orderHash: Hex;
}

export interface TwapStatus {
  registered: boolean;
  cancelled: boolean | null;
  expired: boolean | null;
  schedule:
    | "unregistered"
    | "scheduled"
    | "active"
    | "between-windows"
    | "expired";
  /** Completion requires settlement evidence, never merely elapsed time. */
  filled: "none" | "partial" | "complete" | "unknown";
  filledParts: number;
  totalParts: number;
  executedSellAmount: string;
  executedBuyAmount: string;
  evidence: {
    complete: boolean;
    reasons: string[];
    blockNumber: string;
    blockHash: Hex;
  };
  finality: "finalized" | "pending" | "unknown";
  discovery: "observed" | "not-observed" | "unavailable" | "skipped";
  submission: {
    partIndex: number | null;
    state: "observed" | "not-observed" | "unavailable" | "skipped" | "not-due";
    orderbookStatus?: string;
  };
  start: string | null;
  end: string | null;
  remainingSellBalance: string;
  allowance: string;
}

/** Independent of VenueAdapter: conditional orders return transaction actions,
 * and do not inherit the spot CoW adapter's signing or simulation policy. */
export interface TwapAdapter {
  name: string;
  supports(chainId: number): boolean;
  requireDeployment(module: Module): Promise<void>;
  buildParams(schedule: TwapSchedule, salt: Hex): ConditionalOrderParams;
  create(params: ConditionalOrderParams): TransactionAction;
  cancel(orderHash: Hex): TransactionAction;
  status(
    client: PublicClient,
    reference: TwapReference,
    options?: TwapReadOptions,
  ): Promise<TwapStatus>;
}

export interface TwapReadOptions {
  /** Direct programmatic reads are on-chain only unless explicitly requested. */
  external?: boolean;
  block?: ObservationBlock;
}
