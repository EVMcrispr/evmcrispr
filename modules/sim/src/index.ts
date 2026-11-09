import { defineModule } from "@evmcrispr/sdk";
import { commands } from "./_generated";
import { type SIMULATION_MODES, types } from "./argTypes";
import type { PendingDelivery, RelayHandler } from "./lib/relay";

export type SimMode = (typeof SIMULATION_MODES)[number];

export type {
  PendingDelivery,
  ReceiptLog,
  RelayHandler,
  RelaySourceEvent,
} from "./lib/relay";

/**
 * Fetches the code a fork run loads on first use: the `fork` command, the
 * in-process backend (`ethereumjs` by default, or `revm`) and what
 * suggests checks. In a browser each is a chunk fetched one after another
 * when a run first needs it; a page that expects a run can call this
 * ahead of it so the run starts with them in hand. Never throws: a chunk
 * that fails to load here is simply loaded (and reported) by the run.
 */
export async function preloadSimulation(
  backend: "ethereumjs" | "revm" = "ethereumjs",
): Promise<void> {
  await Promise.allSettled([
    import("./commands/fork"),
    backend === "revm"
      ? import("./lib/revm-backend")
      : import("./lib/ethereumjs-backend"),
    import("./lib/suggest"),
  ]);
}

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
