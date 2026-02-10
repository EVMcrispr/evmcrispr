import { commands, helpers } from "./modules/std";
import type { ModuleBinding, NoNullableBinding } from "./types";
import { BindingsSpace } from "./types";
import {
  createCommandLoaders,
  createHelperLoaders,
} from "./utils/defineModule";

export const DEFAULT_MODULE_BINDING: NoNullableBinding<ModuleBinding> = {
  type: BindingsSpace.MODULE,
  identifier: "std",
  value: {
    commands: createCommandLoaders("std", commands),
    helpers: createHelperLoaders("std", helpers),
  },
};
