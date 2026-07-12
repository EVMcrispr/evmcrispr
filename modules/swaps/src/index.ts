import { defineModule } from "@evmcrispr/sdk";
import { commands, helpers } from "./_generated";
import { types } from "./argTypes";

export default class Swaps extends defineModule(
  "swaps",
  commands,
  helpers,
  types,
) {}
