import { defineModule } from "@evmcrispr/sdk";
import { commands, helpers } from "./_generated";
import { types } from "./argTypes";

export default class Governor extends defineModule(
  "governor",
  commands,
  helpers,
  types,
) {}
