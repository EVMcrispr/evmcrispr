import { tokenSymbolArgType } from "@evmcrispr/module-std";
import { defineModule } from "@evmcrispr/sdk";
import { commands, helpers } from "./_generated";

const types = { "token-symbol": tokenSymbolArgType };

export default class Token extends defineModule(
  "token",
  commands,
  helpers,
  types,
) {}
