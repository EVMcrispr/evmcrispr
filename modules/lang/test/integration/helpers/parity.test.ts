import "../../setup";
import { describeParity } from "@evmcrispr/test-utils/onchain";
import { helpers } from "../../../src/_generated";

/**
 * The two faces of a helper, compared BY VALUE.
 *
 * Each case runs its `run` expression off-chain and its `compile` expression
 * on-chain — compiled, then EXECUTED through `Assertions.resolve` against the
 * real contracts installed on the fork — and the results must match.
 *
 * Parity is the default, not a law: plenty of divergence is correct, and a
 * case declares it with `refuses` / `reverts` / `runThrows` / `diverges`.
 * What the suite forbids is divergence nobody wrote down.
 */

/** Aave v3 pool on Gnosis: `getReservesList()` is a live `address[]`. */
const POOL = "0xb50201558B00496A145fE76f7424749556E326D8";
const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";

const RESERVES = `${POOL}::{getReservesList()(address[])}`;
/** The same call read as words, so the elements arrive as raw bigint. */
const WORDS = `${POOL}::{getReservesList()(uint256[])}`;

describeParity("@lang", {
  module:
    "lang [@at @len @reverse @slice @sort @unique @concat @includes @sum]",
  helpers,
  cases: [
    // ---- one case per category -------------------------------------------
    {
      name: "Uint: a live totalSupply read",
      run: `${WXDAI}::{totalSupply()(uint256)}`,
      compile: `${WXDAI}::{totalSupply()(uint256)}`,
    },
    {
      name: "String: a live symbol read, with its ABI envelope",
      run: `${WXDAI}::{symbol()(string)}`,
      compile: `${WXDAI}::{symbol()(string)}`,
    },
    {
      name: "Address: an element of a live array",
      run: `@at(${RESERVES} 0)`,
      compile: `@at!(${RESERVES} 0)`,
    },
    {
      name: "Bool: whether a live array contains its own first element",
      run: `@includes(${RESERVES} @at(${RESERVES} 0))`,
      compile: `@includes!(${RESERVES} @at!(${RESERVES} 0))`,
    },

    // ---- arrays: the words-payload path -----------------------------------
    {
      name: "length of a live array",
      run: `@len(${RESERVES})`,
      compile: `@len!(${RESERVES})`,
    },
    {
      name: "reverse of a live array",
      run: `@reverse(${RESERVES})`,
      compile: `@reverse!(${RESERVES})`,
      decodeAs: "address[]",
    },
    {
      name: "slice of a live array",
      run: `@slice(${RESERVES} 0 2)`,
      compile: `@slice!(${RESERVES} 0 2)`,
      decodeAs: "address[]",
    },

    // ---- the taxonomy -----------------------------------------------------
    {
      name: "refuses: an index that is not known at composition time",
      run: `@at(${RESERVES} 0)`,
      compile: `@at!(${RESERVES} ${WXDAI}::{decimals()(uint8)})`,
      helper: "at",
      // The message is poor (it is the Num coercion failing, not a check
      // saying the index must be constant). Worth improving; pinned here so
      // the improvement is a deliberate change rather than a silent one.
      refuses: /Cannot coerce/i,
    },
    {
      name: "reverts: an index past the end of a live array",
      run: `@at(${RESERVES} 0)`,
      compile: `@at!(${RESERVES} 9999)`,
      helper: "at",
      reverts: /revert/i,
    },
    {
      name: "diverges: @unique dedups globally off-chain, adjacently on-chain",
      // Doubling the list puts every duplicate far from its twin, so the two
      // behaviours cannot coincide: off-chain collapses back to one copy,
      // on-chain leaves both because no duplicate is adjacent.
      run: `@unique(@concat(${RESERVES} ${RESERVES}))`,
      compile: `@unique!(@concat!(${RESERVES} ${RESERVES}))`,
      decodeAs: "address[]",
      helper: "unique",
      diverges: {
        reason: "uniqueWords removes adjacent duplicates only",
      },
    },

    // ---- a live uint256[], where the numeric shapes have to agree ---------
    // A `::` call normalizes only a TOP-LEVEL bigint to Num, so these arrays
    // arrive as bigint[] while a literal or an arithmetic result is a Num.
    // Before the comparison sites went through sdk/utils/compare.ts, @sort
    // ordered these lexicographically ([1160…, 1265…, 1330…, 1440…, 240…])
    // and @includes answered a silent false for an element that was present.
    {
      name: "sort of a live uint256[] agrees with the on-chain sort",
      run: `@sort(${WORDS})`,
      compile: `@sort!(${WORDS})`,
      decodeAs: "uint256[]",
    },
    {
      // `@num` is what makes this bite: it yields a Num while the elements are
      // raw bigint. Any literal or arithmetic result on the needle side has
      // the same shape, which is why the old failure was a silent false.
      name: "includes finds a live uint256 element given as a number",
      run: `@includes(${WORDS} @num(@at(${WORDS} 0)))`,
      compile: `@includes!(${WORDS} @num!(@at!(${WORDS} 0)))`,
    },
    {
      name: "sum of a live uint256[] agrees with the on-chain sum",
      run: `@sum(${WORDS})`,
      compile: `@sum!(${WORDS})`,
    },
  ],
});
