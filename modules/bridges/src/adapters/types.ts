import type { Action, NodesInterpreters } from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import type Bridges from "..";
import type { SourceTx } from "../utils/receipts";

/**
 * How an adapter derives its quotes and calldata:
 * - "onchain": purely from chain state — deterministic under sim:fork.
 * - "api": needs an HTTP service; must provide a deterministic fallback
 *   (or be rejected) while a sim fork is active.
 */
export type BridgeKind = "onchain" | "api";

export interface BridgeRequest {
  srcChainId: number;
  dstChainId: number;
  /** zeroAddress means the native token. */
  token: Address;
  /** Base units of `token` on the source chain. */
  amount: bigint;
  from: Address;
  recipient: Address;
}

export interface BridgeFeeQuote {
  /** Fee deducted from the bridged amount, in base units of `token`. */
  tokenFee: bigint;
  /** Fee paid as msg.value on the source tx (LZ/CCIP messaging fee,
   *  Arbitrum retryable funding), in wei. */
  nativeFee: bigint;
  /** Expected amount received on the destination, in destination base units. */
  amountOut: bigint;
  /** Opaque adapter route data threaded into buildBridge. */
  route?: unknown;
}

export interface BridgePlan {
  /** ERC-20 spender the auto-approve logic must fund. Undefined when the
   *  token is native or no approval is needed. */
  approvalTarget?: Address;
  /** Amount the approval must cover; defaults to the bridged amount. */
  approvalAmount?: bigint;
  /** ERC-20 to approve, when it isn't the bridged token itself — an OFT
   *  adapter, for instance, escrows the underlying token. */
  approvalToken?: Address;
  actions: Action[];
}

export type BridgeTransferStatus = "pending" | "claimable" | "done" | "unknown";

/**
 * Sim auto-relay descriptor — structurally identical to the sim module's
 * RelayHandler (modules/sim/src/lib/relay.ts); kept duck-typed so neither
 * package depends on the other.
 */
export interface BridgeRelayHandler {
  id: string;
  sourceEvents(srcChainId: number): { topic: Hex; address?: Address }[];
  parse(
    log: { address: Address; topics: Hex[]; data: Hex },
    ctx: { srcChainId: number; txLogs: { topics: Hex[]; data: Hex }[] },
  ): Promise<{ dstChainId: number; note?: string } | null>;
  buildDelivery(
    module: any,
    log: { address: Address; topics: Hex[]; data: Hex },
    ctx: {
      srcChainId: number;
      dstChainId: number;
      txLogs: { address: Address; topics: Hex[]; data: Hex }[];
    },
  ): Promise<Action[]>;
}

export interface BridgeAdapter {
  /** Canonical display name, e.g. "CCTPv2". */
  name: string;
  kind: BridgeKind;
  /** Static lane check (sync so completions can use it). With `token`,
   *  also checks the token is bridgeable on this lane. */
  supports(srcChainId: number, dstChainId: number, token?: Address): boolean;
  /** True when the destination leg needs an explicit `bridges:claim`. */
  requiresClaim(srcChainId: number, dstChainId: number): boolean;
  quote(module: Bridges, req: BridgeRequest): Promise<BridgeFeeQuote>;
  buildBridge(
    module: Bridges,
    req: BridgeRequest & { quote?: BridgeFeeQuote },
    ctx: {
      interpreters: NodesInterpreters;
      opts: Record<string, unknown>;
    },
  ): Promise<BridgePlan>;
  /** Destination-chain claim actions for a source tx. Adapters without a
   *  claim step throw with guidance. */
  buildClaim?(
    module: Bridges,
    src: SourceTx,
    dstChainId: number,
  ): Promise<Action[]>;
  status(module: Bridges, src: SourceTx): Promise<BridgeTransferStatus>;
  /** Sim auto-relay hooks; absent ⇒ sim cannot relay this adapter. */
  relayHandler?: BridgeRelayHandler;
}
