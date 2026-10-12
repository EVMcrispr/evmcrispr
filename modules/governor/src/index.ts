import { defineModule } from "@evmcrispr/sdk";
import { commands, events, helpers } from "./_generated";
import { types } from "./argTypes";

export default class Governor extends defineModule(
  "governor",
  commands,
  helpers,
  types,
) {
  static readonly events = events;
}
