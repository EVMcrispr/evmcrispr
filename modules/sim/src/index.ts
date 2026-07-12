import { defineModule } from "@evmcrispr/sdk";
import { commands } from "./_generated";
import { types } from "./argTypes";
import type { PendingDelivery, RelayHandler } from "./lib/relay";

export type SimMode =
  | "anvil"
  | "hardhat"
  | "tenderly"
  | "tenderly-multichain"
  | "ethereumjs";

export type {
  PendingDelivery,
  ReceiptLog,
  RelayHandler,
  RelaySourceEvent,
} from "./lib/relay";

export default class Sim extends defineModule(
  "sim",
  commands,
  undefined,
  types,
) {
  #mode: SimMode | null = null;

  get mode(): SimMode | null {
    return this.#mode;
  }

  set mode(value: SimMode | null) {
    this.#mode = value;
  }

  /** Chain id of the fork currently receiving actions; null outside forks. */
  activeChainId: number | null = null;

  /**
   * Cross-chain relay handlers, registered structurally by bridge modules
   * (see lib/relay.ts). Instance state — reset on every interpreter run.
   */
  readonly relayHandlers: RelayHandler[] = [];

  /** In-flight cross-chain transfers awaiting their destination leg. */
  readonly pendingDeliveries: PendingDelivery[] = [];

  registerRelayHandler(handler: RelayHandler): void {
    if (!this.relayHandlers.some((h) => h.id === handler.id)) {
      this.relayHandlers.push(handler);
    }
  }
}
