import type { Address } from "../types";
import { encodeResolve } from "./core";
import {
  CONSTRAINT_TYPE,
  type Constraint,
  constraint,
  type InputParam,
  inConstraint,
  staticCallParam,
} from "./erc8211";

const MAX_UINT = (1n << 256n) - 1n;

/** Decode only canonical unsigned predicates that describe one interval. */
function unsignedBounds(check: Constraint): [bigint, bigint] | undefined {
  const { constraintType: type, referenceData: data } = check;
  if (type === CONSTRAINT_TYPE.In) {
    if (!/^0x[0-9a-fA-F]{128}$/.test(data)) return;
    const lower = BigInt(`0x${data.slice(2, 66)}`);
    const upper = BigInt(`0x${data.slice(66)}`);
    return lower <= upper ? [lower, upper] : undefined;
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(data)) return;
  const value = BigInt(data);
  switch (type) {
    case CONSTRAINT_TYPE.Eq:
      return [value, value];
    case CONSTRAINT_TYPE.Gte:
      return [value, MAX_UINT];
    case CONSTRAINT_TYPE.Lte:
      return [0n, value];
  }
}

/** Add a predicate to word 0 without appending a constraint for word 1.
 * Compatible unsigned checks merge into one EQ/GTE/LTE/IN. Other checks
 * remain inside resolve, with the new check on its returned word 0.
 * Constraints on later words retain their positions. Impossible or malformed
 * checks still fail at runtime, including inside lazy expressions. */
export function constrainWord(
  ctx: { core: Address },
  param: InputParam,
  check: Constraint,
): InputParam {
  const [first, ...rest] = param.constraints;
  if (!first) return { ...param, constraints: [check] };
  const a = unsignedBounds(first);
  const b = unsignedBounds(check);
  if (a && b) {
    const lower = a[0] > b[0] ? a[0] : b[0];
    const upper = a[1] < b[1] ? a[1] : b[1];
    if (lower <= upper) {
      const merged =
        lower === upper
          ? constraint("Eq", lower)
          : lower === 0n
            ? constraint("Lte", upper)
            : upper === MAX_UINT
              ? constraint("Gte", lower)
              : inConstraint(lower, upper);
      return { ...param, constraints: [merged, ...rest] };
    }
  }
  return {
    ...staticCallParam(ctx.core, encodeResolve(param), [check]),
    paramType: param.paramType,
  };
}
