import type { Module } from "@evmcrispr/sdk";
import { defineModule } from "@evmcrispr/sdk";
import { commands, helpers } from "./_generated";

export default class Std extends defineModule("std", commands, helpers) {
  get modules(): Module[] {
    return this.context.modules;
  }
}
