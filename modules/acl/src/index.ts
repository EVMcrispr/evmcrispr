import { defineModule } from "@evmcrispr/sdk";
import { commands, events, helpers } from "./_generated";

export default class Acl extends defineModule("acl", commands, helpers) {
  static readonly events = events;
}
