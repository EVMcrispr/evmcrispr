import { evml } from "@evmcrispr/core";
import {
  EXPERIMENTAL_MODULE_NAMES,
  MODULE_NAMES,
  moduleEntries,
} from "./_generated";

export { CORE_MODULES, sortModuleNames } from "./order";
export { EXPERIMENTAL_MODULE_NAMES, MODULE_NAMES, moduleEntries };

/** Register every non-std EVMcrispr module on the shared `evml` tag. */
export function registerAllModules(): void {
  evml.use(...moduleEntries);
}
