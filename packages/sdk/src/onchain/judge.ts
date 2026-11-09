import { ErrorException } from "../errors";
import type { Address } from "../types";
import { CORE_ADDRESS } from "./addresses";
import { encodeOpRead, encodeResolve } from "./core";
import type { Constraint, InputParam } from "./erc8211";
import {
  constraint,
  inConstraint,
  rawParam,
  staticCallParam,
  toWord,
} from "./erc8211";
import { opSelector } from "./operators";
import { constrainWord } from "./word-constraints";

/**
 * Constraint mapping: how a DSL comparison over a live word value becomes
 * an ERC-8211 judged param. EQ/GTE/LTE/IN express unsigned predicates
 * directly as inline constraints; everything else (!=, signed comparisons,
 * signed ~=) routes through the core's `read` splicing the operands into
 * an Operations call — `read(operators, op-selector, [live, literal])` —
 * judged `EQ 1` (comparisons return 0/1 bool words).
 */

const MAX_UINT = (1n << 256n) - 1n;

/** The two contract addresses a judged operator expression needs: the
 *  frozen core (whose `read` composes and judges) and the Operations
 *  periphery (whose functions compute). */
export interface OpsAddresses {
  core: Address;
  operators: Address;
}

/** Judge resolved words while preserving any guards already on the operand. */
export function judged(
  param: InputParam,
  constraints: Constraint[],
  ctx: { core: Address } = { core: CORE_ADDRESS },
): InputParam {
  if (constraints.length === 0) return param;
  if (constraints.length === 1)
    return constrainWord(ctx, param, constraints[0]);
  return param.constraints.length === 0
    ? { ...param, constraints }
    : {
        ...staticCallParam(ctx.core, encodeResolve(param), constraints),
        paramType: param.paramType,
      };
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
      return judged(live, [constraint("Eq", expected)], addrs);
    case "Ne":
      return opJudge(addrs, "ne", false, live, expected);
    case "Ge":
      if (signed) return opJudge(addrs, "ge", true, live, expected);
      return judged(live, [constraint("Gte", expected)], addrs);
    case "Le":
      if (signed) return opJudge(addrs, "le", true, live, expected);
      return judged(live, [constraint("Lte", expected)], addrs);
    case "Gt":
      if (signed) return opJudge(addrs, "gt", true, live, expected);
      if (expected === MAX_UINT) {
        throw new ErrorException(
          "nothing can be greater than the maximum uint256 — the assertion would always fail",
        );
      }
      return judged(live, [constraint("Gte", expected + 1n)], addrs);
    case "Lt":
      if (signed) return opJudge(addrs, "lt", true, live, expected);
      if (expected === 0n) {
        throw new ErrorException(
          "no unsigned value is less than zero — the assertion would always fail",
        );
      }
      return judged(live, [constraint("Lte", expected - 1n)], addrs);
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
      return judged(live, [inConstraint(lower, upper)], addrs);
    }
    default:
      throw new ErrorException(`unsupported operator fragment ${fragment}`);
  }
}

/**
 * The judged param for an unsigned comparison over a raw word whose
 * declared type admits exactly 0..`max` (a `uint8`, an `address`, a
 * `bool`): the comparison's interval cut to that range, as one inline
 * constraint, so a word out of range fails it as surely as `nav` would
 * have refused it, at no extra cost. A comparison no valid value meets is
 * a build error. `undefined` for `!=`, which is not one interval: the
 * caller judges the checked read instead.
 */
export function rangedWordJudge(
  addrs: OpsAddresses,
  raw: InputParam,
  max: bigint,
  fragment: string,
  expected: bigint,
  delta?: bigint,
): InputParam | undefined {
  let lower: bigint;
  let upper: bigint;
  switch (fragment) {
    case "Eq":
      [lower, upper] = [expected, expected];
      break;
    case "Ge":
      [lower, upper] = [expected, MAX_UINT];
      break;
    case "Gt":
      [lower, upper] = [expected + 1n, MAX_UINT];
      break;
    case "Le":
      [lower, upper] = [0n, expected];
      break;
    case "Lt":
      if (expected === 0n) return undefined;
      [lower, upper] = [0n, expected - 1n];
      break;
    case "ApproxEq":
      if (delta === undefined) return undefined;
      [lower, upper] = [
        expected > delta ? expected - delta : 0n,
        expected + delta,
      ];
      break;
    default:
      return undefined;
  }
  if (lower > max) {
    throw new ErrorException(
      `the value read can be at most ${max} for its declared type, so the assertion would always fail`,
    );
  }
  if (upper > max) upper = max;
  return judged(
    raw,
    [
      lower === upper
        ? constraint("Eq", lower)
        : lower === 0n
          ? constraint("Lte", upper)
          : inConstraint(lower, upper),
    ],
    addrs,
  );
}
