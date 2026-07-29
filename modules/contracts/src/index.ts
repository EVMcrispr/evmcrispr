import { defineModule } from "@evmcrispr/sdk";
import { commands, helpers } from "./_generated";
import { types } from "./argTypes";

export default class Contracts extends defineModule(
  "contracts",
  commands,
  helpers,
  types,
) {}
