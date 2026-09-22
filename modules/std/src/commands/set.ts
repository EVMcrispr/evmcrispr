import type { BindingsManager, DestructureSlot } from "@evmcrispr/sdk";
import {
  BindingsSpace,
  checkConfigAccess,
  defineCommand,
  ErrorException,
  parseConfigVarName,
  validateArgType,
} from "@evmcrispr/sdk";
import {
  hasRuntimeValue,
  hasSmartCondition,
  isRuntimeValue,
  smartValueElement,
  snapshotSmartValue,
} from "@evmcrispr/sdk/onchain";
import type Std from "..";

const { USER } = BindingsSpace;

function applyDestructure(
  module: Std,
  slots: DestructureSlot[],
  value: unknown,
  bm: BindingsManager,
  isGlobal: boolean,
): void {
  const fixedLength = isRuntimeValue(value)
    ? value.abiType.type.match(/\[(\d+)\]$/)?.[1]
    : undefined;
  const tuple = isRuntimeValue(value) && value.abiType.type === "tuple";
  const arr =
    isRuntimeValue(value) && (fixedLength || tuple)
      ? Array.from(
          {
            length: fixedLength
              ? Math.min(Number(fixedLength), slots.length)
              : Math.min(
                  (value.abiType as any).components.length,
                  slots.length,
                ),
          },
          (_, i) => smartValueElement(module, value, i),
        )
      : Array.isArray(value)
        ? value
        : [value];
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
      applyDestructure(module, slot, arr[i], bm, isGlobal);
    }
  }
}

export default defineCommand<Std>({
  smartSupport: {
    kind: "runtime",
    reason:
      "Runtime values are captured at assignment and scoped to the smart block.",
  },
  name: "set",
  description: "Assign a value to a variable for use later in the script.",
  args: [
    {
      name: "variable",
      type: "variable",
      description: "Variable name",
      allowConfig: true,
    },
    {
      name: "value",
      type: "any",
      runtime: true,
      description: "Value to assign",
    },
  ],
  async run(module, { variable, value }, { interpreters }) {
    const smartState = interpreters.batchContext?.smartState;
    const conditional = smartState && hasSmartCondition(smartState);
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
      if (conditional)
        throw new ErrorException(
          "config assignments cannot depend on a runtime condition",
        );
      if (hasRuntimeValue(value))
        throw new ErrorException("config variables require build-time values");
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
    const runtime = hasRuntimeValue(value);
    const replacesRuntime = (slot: DestructureSlot): boolean =>
      typeof slot === "string"
        ? hasRuntimeValue(module.bindingsManager.getBindingValue(slot, USER))
        : Array.isArray(slot) && slot.some(replacesRuntime);
    const isGlobal =
      interpreters.origin?.kind !== "module" &&
      !runtime &&
      !replacesRuntime(variable) &&
      !conditional;
    if (runtime) value = await snapshotSmartValue(module, value);
    applyDestructure(
      module,
      [variable],
      [value],
      module.bindingsManager,
      isGlobal,
    );
  },
});
