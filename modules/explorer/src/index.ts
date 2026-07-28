import { defineModule } from "@evmcrispr/sdk";
import { commands, helpers } from "./_generated";
import { types } from "./argTypes";

export default class Explorer extends defineModule(
  "explorer",
  commands,
  helpers,
  types,
) {}
