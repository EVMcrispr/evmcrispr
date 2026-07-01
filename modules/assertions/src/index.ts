import { defineModule } from "@evmcrispr/sdk";
import { commands, helpers } from "./_generated";

export default class Assertions extends defineModule(
  "assertions",
  commands,
  helpers,
) {}
