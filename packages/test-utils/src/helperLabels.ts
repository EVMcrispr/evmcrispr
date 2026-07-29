/**
 * Derive the helper-label lists that completion tests assert against from a
 * module's codegen-generated helpers map (`src/_generated.ts`), so adding or
 * removing a helper never requires hand-updating a list.
 *
 * The bucketing rule deliberately re-states core's completion-filter
 * semantics (packages/core/src/completions.ts, isReturnTypeCompatible)
 * instead of importing it, so that logic stays independently tested:
 * a helper appears in a typed bucket iff its returnType includes that type
 * or "any"; constants carry no returnType and appear only in `all`.
 */

export interface HelperLabelLists {
  /** Every helper plus every constant. */
  all: string[];
  /** Helpers whose returnType includes "address" or "any". */
  address: string[];
  /** Helpers whose returnType includes "number" or "any". */
  number: string[];
  /** Helpers whose returnType includes "bytes32" or "any". */
  bytes32: string[];
  /** Helpers whose returnType includes "bool" or "any". */
  bool: string[];
  /** Helpers whose returnType includes "bytes" or "any". */
  bytes: string[];
  /** Helpers with hasArgs === false, plus all constants. */
  noArgs: string[];
}

interface HelperEntryLike {
  returnType?: string | string[];
  hasArgs?: boolean;
}

const TYPED_BUCKETS = [
  "address",
  "number",
  "bytes32",
  "bool",
  "bytes",
] as const;

export function helperLabels(
  helpers: Record<string, HelperEntryLike>,
  opts: { module?: string; constants?: Record<string, string> } = {},
): HelperLabelLists {
  const names = Object.keys(helpers);
  if (names.length === 0) {
    throw new Error(
      "helperLabels: received an empty helpers map — check the _generated import",
    );
  }

  const label = (name: string): string =>
    opts.module ? `@${opts.module}:${name}` : `@${name}`;

  const lists: HelperLabelLists = {
    all: [],
    address: [],
    number: [],
    bytes32: [],
    bool: [],
    bytes: [],
    noArgs: [],
  };

  for (const [name, entry] of Object.entries(helpers)) {
    const l = label(name);
    lists.all.push(l);
    if (entry.hasArgs === false) lists.noArgs.push(l);
    const returnTypes = Array.isArray(entry.returnType)
      ? entry.returnType
      : entry.returnType
        ? [entry.returnType]
        : [];
    for (const bucket of TYPED_BUCKETS) {
      if (returnTypes.includes("any") || returnTypes.includes(bucket)) {
        lists[bucket].push(l);
      }
    }
  }

  for (const name of Object.keys(opts.constants ?? {})) {
    const l = label(name);
    lists.all.push(l);
    lists.noArgs.push(l);
  }

  for (const key of Object.keys(lists) as (keyof HelperLabelLists)[]) {
    lists[key].sort();
  }
  return lists;
}
