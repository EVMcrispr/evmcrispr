import { defineModule } from "@evmcrispr/sdk";
import { chains, commands, configs, helpers } from "./_generated";
import { types } from "./argTypes";

export default class Eez extends defineModule(
  "eez",
  commands,
  helpers,
  types,
  undefined,
  configs,
  chains,
) {}
