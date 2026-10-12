import { defineModule } from "@evmcrispr/sdk";
import { commands, events, helpers } from "./_generated";
import { types } from "./argTypes";

export default class Ens extends defineModule("ens", commands, helpers, types) {
  static readonly events = events;
}
