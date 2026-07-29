import type { BindingsManager, DestructureSlot } from "@evmcrispr/sdk";
import {
  BindingsSpace,
  checkConfigAccess,
  defineCommand,
  ErrorException,
  parseConfigVarName,
  validateArgType,
} from "@evmcrispr/sdk";
import type Std from "..";

const { USER } = BindingsSpace;

function applyDestructure(
  slots: DestructureSlot[],
  value: unknown,
  bm: BindingsManager,
  isGlobal: boolean,
): void {
  const arr = Array.isArray(value) ? value : [value];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (slot === null) continue;
    if (i >= arr.length) {
      throw new ErrorException(
        `destructure index ${i} out of bounds (value has ${arr.length} elements)`,
      );
    }
    if (typeof slot === "string") {
      bm.setBinding(slot, arr[i], USER, isGlobal, undefined, true);
    } else {
      applyDestructure(slot, arr[i], bm, isGlobal);
    }
  }
}

export default defineCommand<Std>({
  name: "set",
  description: "Assign a value to a variable for use later in the script.",
  args: [
    {
      name: "variable",
      type: "variable",
      description: "Variable name",
      allowConfig: true,
    },
    { name: "value", type: "any", description: "Value to assign" },
  ],
  async run(module, { variable, value }, { interpreters }) {
    // Config variables (`$mod:key`): declared-key + write-access checks and
    // type validation against the declaration.
    const cfg =
      typeof variable === "string" ? parseConfigVarName(variable) : null;
    if (typeof variable === "string" && variable.includes(":") && !cfg) {
      throw new ErrorException(
        `${variable} is not a valid config variable name — expected $<module>:<key> with a letters-and-digits key`,
      );
    }
    if (cfg) {
      const def = checkConfigAccess(
        module.bindingsManager,
        cfg.module,
        cfg.key,
        interpreters.origin,
        "write",
      );
      validateArgType(variable, value, def.type);
      module.bindingsManager.setBinding(
        variable,
        value,
        USER,
        true,
        undefined,
        true,
      );
      return;
    }

    // Module-origin code (EVML module def bodies) binds scope-locally:
    // temporaries live for the def's dynamic extent and never clobber the
    // caller's variables. User-origin sets stay global as always.
    const isGlobal = interpreters.origin?.kind !== "module";
    applyDestructure([variable], [value], module.bindingsManager, isGlobal);
  },
});
