import { defineModule } from "@evmcrispr/sdk";
import { commands, configs, helpers } from "./_generated";
import { types } from "./argTypes";
import type { TwapReference } from "./twap/types";

export default class Swaps extends defineModule(
  "swaps",
  commands,
  helpers,
  types,
  undefined,
  configs,
) {
  /** Separate reservations for live clients and each simulation fork. Module
   * instances are recreated by the interpreter for every run. */
  readonly twapReservations = new WeakMap<object, Set<string>>();
  /** Orders created in this run, by `chainId:orderHash`, so they resolve
   * before their registration is mined. */
  readonly twapOrders = new Map<string, TwapReference>();
}
