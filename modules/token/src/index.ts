import { tokenSymbolArgType } from "@evmcrispr/module-std";
import { defineModule } from "@evmcrispr/sdk";
import { commands, events, helpers } from "./_generated";

const types = { "token-symbol": tokenSymbolArgType };

export default class Token extends defineModule(
  "token",
  commands,
  helpers,
  types,
) {
  static readonly events = events;
}
