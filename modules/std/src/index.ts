import type { Module } from "@evmcrispr/sdk";
import { defineModule } from "@evmcrispr/sdk";
import { zeroAddress } from "viem";
import { commands, configs, helpers } from "./_generated";
import { types } from "./argTypes";

export { tokenSymbolArgType } from "./argTypes";
export { getChainNativeCurrency, resolveToken } from "./helpers/token";
export { commands, helpers };
export const constants = { ZERO_ADDRESS: zeroAddress };

export default class Std extends defineModule(
  "std",
  commands,
  helpers,
  types,
  constants,
  configs,
) {
  get modules(): Module[] {
    return this.context.modules;
  }
}
