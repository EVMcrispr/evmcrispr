import type { ModuleBinding } from '@1hive/evmcrispr';
import { BindingsSpace, stdCommands, stdHelpers } from '@1hive/evmcrispr';

export const DEFAULT_MODULE_BINDING: ModuleBinding = {
  type: BindingsSpace.MODULE,
  identifier: 'std',
  value: { commands: stdCommands, helpers: stdHelpers },
};
