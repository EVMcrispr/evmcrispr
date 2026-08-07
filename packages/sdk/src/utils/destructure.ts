import type { BindingsManager } from "../BindingsManager";
import { ErrorException } from "../errors";
import type { DestructureSlot } from "../types";
import { BindingsSpace } from "../types";

const { USER } = BindingsSpace;

export function valueToString(value: unknown): string {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "boolean") {
    return value.toString();
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value, (_key, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
  }
  return String(value);
}

/**
 * Convert decoded args (possibly a named object) to a positional array.
 */
export function argsToArray(
  args: readonly unknown[] | Record<string, unknown>,
): unknown[] {
  if (Array.isArray(args)) return args as unknown[];
  if (typeof args === "object" && args !== null) {
    return Object.values(args);
  }
  return [args];
}

/**
 * Recursively walk a DestructureSlot[] pattern and store captured values
 * as user bindings. Variable names are without `$`; the prefix is added
 * when storing.
 */
export function applyDestructure(
  slots: DestructureSlot[],
  args: unknown,
  contextName: string,
  bindingsManager: BindingsManager,
): void {
  const arr = argsToArray(args as readonly unknown[] | Record<string, unknown>);

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (slot === null) continue;
    if (slot === "...") {
      throw new ErrorException(
        `the ... rest marker is not supported in "${contextName}" captures — use holes (_) instead`,
      );
    }
    if (i >= arr.length) {
      throw new ErrorException(
        `destructure index ${i} out of bounds for "${contextName}" (${arr.length} args)`,
      );
    }
    if (typeof slot === "string") {
      bindingsManager.setBinding(
        `$${slot}`,
        valueToString(arr[i]),
        USER,
        true,
        undefined,
        true,
      );
    } else {
      applyDestructure(slot, arr[i], contextName, bindingsManager);
    }
  }
}
