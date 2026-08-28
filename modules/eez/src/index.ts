import { defineModule } from "@evmcrispr/sdk";
import { chains, commands, configs, helpers } from "./_generated";

export default class Eez extends defineModule(
  "eez",
  commands,
  helpers,
  undefined,
  undefined,
  configs,
  chains,
) {}
