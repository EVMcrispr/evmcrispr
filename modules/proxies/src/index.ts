import { defineModule } from "@evmcrispr/sdk";
import { commands, events, helpers } from "./_generated";

export default class Proxies extends defineModule(
  "proxies",
  commands,
  helpers,
) {
  static readonly events = events;
}
