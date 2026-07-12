import type { Action, Module } from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";

/**
 * Log shape shared by real receipts (viem) and the synthetic receipts the
 * ethereumjs backend produces — the subset the relay engine needs.
 */
export interface ReceiptLog {
  address: Address;
  topics: Hex[];
  data: Hex;
}

/** A source-chain event a relay handler watches for. */
export interface RelaySourceEvent {
  /** topic0 (keccak256 of the event signature). */
  topic: Hex;
  /** Optional emitter filter; omit to match any address. */
  address?: Address;
}

/**
 * Cross-chain relay handler, registered structurally by bridge modules via
 * `Sim.registerRelayHandler` (found through `module.context.modules` — no
 * package dependency in either direction).
 *
 * Delivery actions may be transaction actions with an arbitrary `from`
 * (executed impersonated on the destination fork), rpc actions using the
 * active mode's admin prefix (`anvil_setBalance`, …), or the two virtual
 * methods the fork's delivery executor implements: `sim_dealToken`
 * [token, to, amountHex] and `sim_addNativeBalance` [address, amountHex].
 */
export interface RelayHandler {
  /** Stable identifier, e.g. "cctp-v2" — used to dedupe registrations. */
  id: string;
  /** Events to watch while a fork of `srcChainId` is active. */
  sourceEvents(srcChainId: number): RelaySourceEvent[];
  /**
   * Decode a matched log into its destination chain. Runs while the SOURCE
   * fork is still active (reads through `module.getClient()` see source
   * state). Return null to ignore the log.
   */
  parse(
    log: ReceiptLog,
    ctx: { srcChainId: number; txLogs: ReceiptLog[] },
  ): Promise<{ dstChainId: number; note?: string } | null>;
  /**
   * Build the destination-leg actions. Runs while the DESTINATION fork is
   * active (`module.getClient()` reads destination state).
   */
  buildDelivery(
    module: Module,
    log: ReceiptLog,
    ctx: { srcChainId: number; dstChainId: number; txLogs: ReceiptLog[] },
  ): Promise<Action[]>;
}

/** An in-flight cross-chain transfer awaiting its destination leg. */
export interface PendingDelivery {
  handlerId: string;
  srcChainId: number;
  dstChainId: number;
  log: ReceiptLog;
  txLogs: ReceiptLog[];
  /** Monotonic per-fork-block sequence; deliveries drain in source order. */
  seq: number;
  note?: string;
}

export function matchesSourceEvent(
  log: ReceiptLog,
  event: RelaySourceEvent,
): boolean {
  const topic0 = log.topics[0];
  if (!topic0 || topic0.toLowerCase() !== event.topic.toLowerCase()) {
    return false;
  }
  if (
    event.address &&
    event.address.toLowerCase() !== log.address.toLowerCase()
  ) {
    return false;
  }
  return true;
}
