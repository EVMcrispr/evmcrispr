import "../../setup";
import {
  describeParity,
  installConstantMock,
} from "@evmcrispr/test-utils/onchain";
import { encodeAbiParameters } from "viem";
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

/**
 * A live `int256[]` with negatives, so the signed sort path is exercised.
 *
 * Nothing on the fork returns one, and this is the case most worth having:
 * `@sort!` flips the sign bit on the way in and back on the way out, because
 * `sortWords` is unsigned and a two's-complement negative reads as a huge
 * unsigned number. Without a signed case that flip is only pinned by the
 * calldata-shape tests, which assert the bytes we expect rather than the
 * order that comes back.
 */
const SIGNED = [-5n, 3n, -1n, 2n, 0n];
const SIGNED_SRC = "0x0000000000000000000000000000000000005147";
const SIGNED_CALL = `${SIGNED_SRC}::{values()(int256[])}`;

/** A 20-element array, long enough to index with a live `decimals()` read. */
const LONG_SRC = "0x0000000000000000000000000000000000005148";
const LONG = Array.from({ length: 20 }, (_, i) => BigInt(i * 10));
const LONG_CALL = `${LONG_SRC}::{values()(uint256[])}`;

describeParity("@lang", {
  module:
    "lang [@at @len @reverse @slice @sort @unique @concat @includes @sum]",
  helpers,
  setup: (client) =>
    installConstantMock(
      client,
      SIGNED_SRC,
      encodeAbiParameters([{ type: "int256[]" }], [SIGNED]),
    ).then(() =>
      installConstantMock(
        client,
        LONG_SRC,
        encodeAbiParameters([{ type: "uint256[]" }], [LONG]),
      ),
    ),
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
      // A live read as the index is NOT rejected: constIntArg interprets the
      // node, which executes the call at composition time and freezes the
      // value into the operand. So `decimals()` here means "18 as it was when
      // the script was built", not a live index. Pinned because it is easy to
      // read as live and is not.
      name: "an index read from a call is frozen at composition time",
      run: `@at(${LONG_CALL} ${WXDAI}::{decimals()(uint8)})`,
      compile: `@at!(${LONG_CALL} ${WXDAI}::{decimals()(uint8)})`,
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
      // sortWords is UNSIGNED, so the compiler flips the sign bit on the way
      // in and back on the way out. Sorted by value the negatives come first;
      // without the flip they sort by raw word and land last, which is what
      // this case catches.
      name: "sort of a live int256[] orders by value, not by raw word",
      run: `@sort(${SIGNED_CALL})`,
      compile: `@sort!(${SIGNED_CALL})`,
      decodeAs: "int256[]",
    },
    {
      name: "includes finds a negative element given as a number",
      run: `@includes(${SIGNED_CALL} @num(0 - 5))`,
      compile: `@includes!(${SIGNED_CALL} @num!(0 - 5))`,
    },
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
