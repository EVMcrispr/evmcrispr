import { defineModule } from "@evmcrispr/sdk";
import { commands, helpers } from "./_generated";

export default class MathModule extends defineModule(
  "math",
  commands,
  helpers,
) {}
