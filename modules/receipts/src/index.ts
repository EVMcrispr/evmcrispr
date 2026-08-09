import { defineModule } from "@evmcrispr/sdk";
import { commands, helpers } from "./_generated";
import { types } from "./argTypes";

export default class Receipts extends defineModule(
  "receipts",
  commands,
  helpers,
  types,
) {}
