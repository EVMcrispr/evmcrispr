import type { Module } from "@evmcrispr/sdk";
import { defineModule } from "@evmcrispr/sdk";
import { zeroAddress } from "viem";
import { commands, helpers } from "./_generated";
import { types } from "./argTypes";

export { commands, helpers };
export const constants = { ZERO_ADDRESS: zeroAddress };

export default class Std extends defineModule(
  "std",
  commands,
  helpers,
  types,
  constants,
) {
  get modules(): Module[] {
    return this.context.modules;
  }
}
