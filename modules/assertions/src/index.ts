import { defineModule } from "@evmcrispr/sdk";
import { commands, configs, helpers } from "./_generated";

export default class Assertions extends defineModule(
  "assertions",
  commands,
  helpers,
  undefined,
  undefined,
  configs,
) {}
