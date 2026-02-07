import type { ModuleBinding, NoNullableBinding } from "@evmcrispr/core";
import { BindingsSpace, stdCommands, stdHelpers } from "@evmcrispr/core";

export const DEFAULT_MODULE_BINDING: NoNullableBinding<ModuleBinding> = {
  type: BindingsSpace.MODULE,
  identifier: "std",
  value: { commands: stdCommands, helpers: stdHelpers },
};
