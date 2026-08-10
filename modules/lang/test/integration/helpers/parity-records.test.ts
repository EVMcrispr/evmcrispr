import "../../setup";
import {
  describeParity,
  installConstantMock,
} from "@evmcrispr/test-utils/onchain";
import { encodeAbiParameters } from "viem";
import { helpers } from "../../../src/_generated";

/**
 * The record family: @zip, @unzip, @keys, @values, @lookup, @enumerate.
 *
 * On-chain a "record" is not a record at all — it is a word-pair payload, and
 * string names travel as keccak digests. So these are the faces most likely to
 * agree on a value while meaning different things, which is why the pairs are
 * built from numbers here: with digests involved the two representations
 * cannot be compared directly, and that limit is itself declared below.
 */

const A_SRC = "0x0000000000000000000000000000000000007a01";
const B_SRC = "0x0000000000000000000000000000000000007a02";
const A = [10n, 20n, 30n];
const B = [11n, 22n, 33n];
const AC = `${A_SRC}::{values()(uint256[])}`;
const BC = `${B_SRC}::{values()(uint256[])}`;

describeParity("@lang records", {
  module: "lang [@zip @unzip @keys @values @lookup @enumerate @len @at @flat]",
  helpers,
  setup: async (client) => {
    await installConstantMock(
      client,
      A_SRC,
      encodeAbiParameters([{ type: "uint256[]" }], [A]),
    );
    await installConstantMock(
      client,
      B_SRC,
      encodeAbiParameters([{ type: "uint256[]" }], [B]),
    );
  },
  cases: [
    {
      // Off-chain a zip is an array of PAIRS, so @len counts 3; on-chain it is
      // a flat word-pair payload, so @len! counts 6. Anyone composing the two
      // gets double, which is why zip's compileDescription now says so.
      name: "diverges: len over a zip counts pairs off-chain and words on-chain",
      run: `@len(@zip(${AC} ${BC}))`,
      compile: `@len!(@zip!(${AC} ${BC}))`,
      helper: "zip",
      diverges: { reason: "an on-chain record is a flat word-pair payload" },
    },
    {
      name: "keys of a zip recovers the first lane",
      run: `@keys(@zip(${AC} ${BC}))`,
      compile: `@keys!(@zip!(${AC} ${BC}))`,
      decodeAs: "uint256[]",
    },
    {
      name: "values of a zip recovers the second lane",
      run: `@values(@zip(${AC} ${BC}))`,
      compile: `@values!(@zip!(${AC} ${BC}))`,
      decodeAs: "uint256[]",
    },
    {
      name: "lookup finds a value by its key",
      run: `@lookup(@zip(${AC} ${BC}) 20)`,
      compile: `@lookup!(@zip!(${AC} ${BC}) 20)`,
    },
    {
      // @enumerate pairs each element with its index, so lane 0 is 0..n-1.
      name: "enumerate then keys is the index lane",
      run: `@keys(@enumerate(${AC}))`,
      compile: `@keys!(@enumerate!(${AC}))`,
      decodeAs: "uint256[]",
    },
    {
      name: "enumerate then values is the original array",
      run: `@values(@enumerate(${AC}))`,
      compile: `@values!(@enumerate!(${AC}))`,
      decodeAs: "uint256[]",
    },
    {
      // @unzip! takes a lane and returns ONE, where the plain face returns
      // both — a signature difference, so the run side selects lane 0 itself.
      name: "unzip lane 0 matches the on-chain single-lane form",
      run: `@at(@unzip(@zip(${AC} ${BC})) 0)`,
      compile: `@unzip!(@zip!(${AC} ${BC}) 0)`,
      decodeAs: "uint256[]",
    },
  ],
});
