import { defineModule } from "@evmcrispr/sdk";
import { commands, helpers } from "./_generated";

export default class AccessControl extends defineModule(
  "access-control",
  commands,
  helpers,
) {}
