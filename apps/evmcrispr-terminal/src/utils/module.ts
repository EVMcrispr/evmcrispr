import type { ModuleBinding, NoNullableBinding } from "@1hive/evmcrispr";
import { BindingsSpace, stdCommands, stdHelpers } from "@1hive/evmcrispr";

export const DEFAULT_MODULE_BINDING: NoNullableBinding<ModuleBinding> = {
  type: BindingsSpace.MODULE,
  identifier: "std",
  value: { commands: stdCommands, helpers: stdHelpers },
};
