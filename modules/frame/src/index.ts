import { defineModule } from "@evmcrispr/sdk";
import { chains, commands, configs, helpers } from "./_generated";

export default class Frame extends defineModule(
  "frame",
  commands,
  helpers,
  {},
  undefined,
  configs,
  chains,
) {
  /** How many `frame:tx` blocks are being interpreted right now. */
  depth = 0;
}
