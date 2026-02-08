import { commands as stdCommands, helpers as stdHelpers } from "./modules/std";
import type { ModuleBinding, NoNullableBinding } from "./types";
import { BindingsSpace } from "./types";

export const DEFAULT_MODULE_BINDING: NoNullableBinding<ModuleBinding> = {
  type: BindingsSpace.MODULE,
  identifier: "std",
  value: { commands: stdCommands, helpers: stdHelpers },
};
