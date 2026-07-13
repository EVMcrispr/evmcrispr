import { defineModule } from "@evmcrispr/sdk";
import { commands, helpers } from "./_generated";
import { types } from "./argTypes";

export default class Superfluid extends defineModule(
  "superfluid",
  commands,
  helpers,
  types,
) {}
