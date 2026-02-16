import type { Module } from "@evmcrispr/sdk";
import { defineModule } from "@evmcrispr/sdk";
import { zeroAddress } from "viem";
import { commands, helpers } from "./_generated";

export default class Std extends defineModule("std", commands, helpers, undefined, {
  ETH: zeroAddress,
  ZERO_ADDRESS: zeroAddress,
}) {
  get modules(): Module[] {
    return this.context.modules;
  }
}
