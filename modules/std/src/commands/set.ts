import type { BindingsManager, DestructureSlot } from "@evmcrispr/sdk";
import { BindingsSpace, ErrorException, defineCommand } from "@evmcrispr/sdk";
import type Std from "..";

const { USER } = BindingsSpace;

function applyDestructure(
  slots: DestructureSlot[],
  value: unknown,
  bm: BindingsManager,
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
      bm.setBinding(slot, arr[i], USER, true, undefined, true);
    } else {
      applyDestructure(slot, arr[i], bm);
    }
  }
}

export default defineCommand<Std>({
  name: "set",
  description: "Assign a value to a variable for use later in the script.",
  args: [
    { name: "variable", type: "variable" },
    { name: "value", type: "any" },
  ],
  async run(module, { variable, value }) {
    applyDestructure([variable], [value], module.bindingsManager);
  },
});
