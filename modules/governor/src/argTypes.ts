import type { CustomArgTypes } from "@evmcrispr/sdk";
import { ErrorException, fieldItem, isNum, Num } from "@evmcrispr/sdk";

const VOTE_SUPPORT: Record<string, number> = {
  against: 0,
  for: 1,
  abstain: 2,
};

/**
 * Resolve a `voteSupport`-typed value to the Governor's uint8 support value
 * (0 = Against, 1 = For, 2 = Abstain). Accepts the names or the raw number.
 */
export function resolveVoteSupport(value: unknown): number {
  if (
    typeof value === "string" &&
    VOTE_SUPPORT[value.toLowerCase()] !== undefined
  ) {
    return VOTE_SUPPORT[value.toLowerCase()];
  }
  if (isNum(value)) {
    const num = value instanceof Num ? value : Num(String(value));
    if (num.isInteger() && num.num >= 0n && num.num <= 2n) {
      return Number(num.toBigInt());
    }
  }
  throw new ErrorException(
    `invalid vote support "${value}" — use for, against, abstain (or 1, 0, 2)`,
  );
}

export const types: CustomArgTypes = {
  voteSupport: {
    validate(name, value) {
      try {
        resolveVoteSupport(value);
      } catch {
        throw new ErrorException(
          `${name} must be for, against or abstain (or 1, 0, 2), got ${value}`,
        );
      }
    },
    completions() {
      return Object.keys(VOTE_SUPPORT).map(fieldItem);
    },
  },
};
