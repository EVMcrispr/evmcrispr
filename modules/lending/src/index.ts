import { defineModule } from "@evmcrispr/sdk";
import { commands, helpers } from "./_generated";
import { types } from "./argTypes";

export default class Lending extends defineModule(
  "lending",
  commands,
  helpers,
  types,
) {}
