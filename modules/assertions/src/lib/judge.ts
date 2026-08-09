import type { Address } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import { encodeOpRead } from "./core";
import type { Constraint, InputParam } from "./erc8211";
import {
  constraint,
  inConstraint,
  rawParam,
  staticCallParam,
  toWord,
} from "./erc8211";
import { opSelector } from "./operators";

/**
 * Constraint mapping: how a DSL comparison over a live word value becomes
 * an ERC-8211 judged param. EQ/GTE/LTE/IN express unsigned predicates
 * directly as inline constraints; everything else (!=, signed comparisons,
 * signed ~=) routes through the core's `read` splicing the operands into
 * an Operators call — `read(operators, op-selector, [live, literal])` —
 * judged `EQ 1` (comparisons return 0/1 bool words).
 */

const MAX_UINT = (1n << 256n) - 1n;

/** The two contract addresses a judged operator expression needs: the
 *  frozen core (whose `read` composes and judges) and the Operators
 *  periphery (whose functions compute). */
export interface OpsAddresses {
  core: Address;
  operators: Address;
}

/** Attach constraints to a compiled (constraint-free) param. */
export function judged(
  param: InputParam,
  constraints: Constraint[],
): InputParam {
  return { ...param, constraints };
}

/** Wrap a live param in `read(operators, op, [live, word])` judged `EQ 1`. */
export function opJudge(
  addrs: OpsAddresses,
  op: string,
  signed: boolean,
  live: InputParam,
  word: bigint,
): InputParam {
  return staticCallParam(
    addrs.core,
    encodeOpRead(addrs.operators, opSelector(op, signed), [
      live,
      rawParam(toWord(word)),
    ]),
    [constraint("Eq", 1n)],
  );
}

/** The judged param for a live word value vs an integer constant.
 *  `fragment` is the operator name fragment (Eq/Ne/Gt/Lt/Ge/Le/ApproxEq);
 *  `signed` selects the int256 overloads. */
export function wordJudge(
  addrs: OpsAddresses,
  live: InputParam,
  fragment: string,
  expected: bigint,
  opts: { signed?: boolean; delta?: bigint } = {},
): InputParam {
  const { signed = false, delta } = opts;
  switch (fragment) {
    case "Eq":
      return judged(live, [constraint("Eq", expected)]);
    case "Ne":
      return opJudge(addrs, "ne", false, live, expected);
    case "Ge":
      if (signed) return opJudge(addrs, "ge", true, live, expected);
      return judged(live, [constraint("Gte", expected)]);
    case "Le":
      if (signed) return opJudge(addrs, "le", true, live, expected);
      return judged(live, [constraint("Lte", expected)]);
    case "Gt":
      if (signed) return opJudge(addrs, "gt", true, live, expected);
      if (expected === MAX_UINT) {
        throw new ErrorException(
          "nothing can be greater than the maximum uint256 — the assertion would always fail",
        );
      }
      return judged(live, [constraint("Gte", expected + 1n)]);
    case "Lt":
      if (signed) return opJudge(addrs, "lt", true, live, expected);
      if (expected === 0n) {
        throw new ErrorException(
          "no unsigned value is less than zero — the assertion would always fail",
        );
      }
      return judged(live, [constraint("Lte", expected - 1n)]);
    case "ApproxEq": {
      if (delta === undefined) {
        throw new ErrorException("the ~= operator requires a --delta value");
      }
      if (signed) {
        // |live - x| <= d over signed operands (absDiff returns a uint).
        return staticCallParam(
          addrs.core,
          encodeOpRead(addrs.operators, opSelector("absDiff", true), [
            live,
            rawParam(toWord(expected)),
          ]),
          [constraint("Lte", delta)],
        );
      }
      const lower = expected > delta ? expected - delta : 0n;
      const upper = expected > MAX_UINT - delta ? MAX_UINT : expected + delta;
      return judged(live, [inConstraint(lower, upper)]);
    }
    default:
      throw new ErrorException(`unsupported operator fragment ${fragment}`);
  }
}
