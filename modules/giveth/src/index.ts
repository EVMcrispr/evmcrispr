import { defineModule } from "@evmcrispr/sdk";
import { commands, helpers } from "./_generated";
import { types } from "./argTypes";

export default class Giveth extends defineModule(
  "giveth",
  commands,
  helpers,
  types,
) {}
