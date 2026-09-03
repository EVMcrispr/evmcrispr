/**
 * Pure types for the on-chain expression layer. No runtime imports beyond
 * type positions, so the base SDK (defineHelper, module metadata) can
 * reference compile faces without pulling the compiler in at runtime.
 */
import type { Module } from "../Module";
import type { Address, HelperFunctionNode, NodesInterpreters } from "../types";
import type { Num } from "../utils/Num";
import type { InputParam } from "./erc8211";

/** Assertion value categories, keyed by the contract function name suffix. */
export type Category =
  | "Uint"
  | "Int"
  | "Address"
  | "Bool"
  | "Bytes32"
  | "String"
  | "Bytes";

/**
 * A compiled expression operand: either a value known at build time, or an
 * ERC-8211 `InputParam` resolved on-chain at assertion time (a staticcall,
 * balance read, or nested core/operator expression).
 */
/**
 * How many decimal places the integer word carries: the word is the real
 * value times 10^scale. Absent (or 0) is a plain integer, which is nearly
 * everything — a balance in wei is scale 0, because wei IS the unit.
 *
 * A scale lets a genuinely fractional quantity travel as a word without
 * anyone pre-multiplying by hand: an Aave rate is ray (scale 27), a Comet
 * rate is wad (scale 18), and `apy > 0.05` compares them exactly, because
 * aligning the literal 0.05 to scale 27 makes it the integer 5e25.
 */
export type Scale = number;

export type Operand =
  | {
      kind: "const";
      cat: Category;
      value: Num | boolean | string;
      scale?: Scale;
    }
  | {
      kind: "call";
      param: InputParam;
      cat: Category;
      scale?: Scale;
      /** When this param is `eq(inner, 0)`, the inner param — lets the top
       *  level judge `inner EQ 0` instead of `eq(inner, 0) EQ 1`. */
      notOf?: InputParam;
      /** When this param is `isValid(inner)`, the inner param — asserting
       *  the bool true is exactly `inner` resolving, so the top level can
       *  judge a ZERO-constraint entry on `inner` instead of
       *  `isValid(inner) EQ 1`. The raw form fails with the resolution's
       *  own error (e.g. revertData's UnexpectedRevertData) rather than a
       *  flat ConstraintFailed. */
      validOf?: InputParam;
      /** When this param is `mul(a, b)` over unsigned operands, the
       *  operand params — lets a following division fuse into one 512-bit
       *  `mulDiv(a, b, d)` read instead of div(mul(a, b), d), which would
       *  revert on an intermediate past 2^256. */
      mulOf?: { a: InputParam; b: InputParam };
    };

/** Context threaded through on-chain expression compilation. */
/** What a face learned while compiling that the command emitting the
 *  assertion has to honour. One bag per compilation, shared by every
 *  nested face (dispatch copies the ctx but keeps this object). */
export interface CompileHints {
  /** The expression only resolves inside a transaction (an EEZ cross-chain
   *  static read is composed by the sequencer, never by `eth_call`), so
   *  `assert` must emit a transaction rather than a read-only call. */
  transact?: boolean;
}

export interface CompileCtx {
  /** The module hosting the compilation (dispatch swaps in the owning
   *  module before calling a helper's `compile`). */
  module: Module;
  interpreters: NodesInterpreters;
  /** Resolved assertions core address (read/pick/nav/chain live here). */
  core: Address;
  /** Resolved operators contract address (the plain word/bytes ops). */
  operators: Address;
  /** Set by faces, read by the emitting command; absent in contexts that
   *  never emit (hover, completions). */
  hints?: CompileHints;
}

/** A helper's on-chain face: turns the helper's raw AST node into an
 *  {@link Operand} evaluated at assertion time (the `@name!` surface). */
export type HelperCompile = (
  ctx: CompileCtx,
  node: HelperFunctionNode,
) => Promise<Operand>;
