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

describeParity("@lang", {
  module:
    "lang [@at @len @reverse @slice @sort @unique @concat @includes @any]",
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

    // NOT YET COVERED, and known to fail: `@sort` and `@includes` over a live
    // uint256[]. The interpreter converts only a TOP-LEVEL bigint to Num, so a
    // uint256[] arrives as bigint[] and both helpers take their non-Num path —
    // @sort compares lexicographically and @includes falls through to `a === b`
    // and answers a silent false. Those cases land together with the fix to the
    // comparison sites, so the fix cannot accidentally be satisfied by a case
    // written after the fact.
  ],
});
