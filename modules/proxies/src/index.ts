import { defineModule } from "@evmcrispr/sdk";
import { commands, helpers } from "./_generated";

export default class Proxies extends defineModule(
  "proxies",
  commands,
  helpers,
) {}
