import { defineModule } from "@evmcrispr/sdk";
import { commands, helpers } from "./_generated";
import { types } from "./argTypes";

export default class Bridges extends defineModule(
  "bridges",
  commands,
  helpers,
  types,
) {}
