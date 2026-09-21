import { defineModule } from "@evmcrispr/sdk";
import { commands, configs, helpers } from "./_generated";
import { types } from "./argTypes";

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
}
