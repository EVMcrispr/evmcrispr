import "../../setup";
import {
  describeParity,
  installConstantMock,
} from "@evmcrispr/test-utils/onchain";
import { encodeAbiParameters } from "viem";
import { helpers } from "../../../src/_generated";

/**
 * The def-backed lambda family, compared by value.
 *
 * This is the most intricate compile path in the module — `@map!` and
 * `@filter!` splice a template into `mapWords`/`filterWords` at the element
 * offsets a def's parameter occupies, `@reduce!` folds with an accumulator
 * window beside the element one, and `@any!`/`@all!`/`@find!` are folds with
 * different exits. Until now all of it was pinned only by calldata-shape
 * tests, which assert the bytes we expect to emit rather than the values that
 * come back.
 *
 * `@name` and `@name!` are independent bindings, so each lambda is defined
 * twice in the preamble: the plain def drives the off-chain face, the bang def
 * the on-chain one. That is the point rather than an inconvenience — the two
 * bodies are written separately and the test is that they agree.
 */

/** A source of a small, controlled `uint256[]`. Real fork arrays are address
 *  words, where a doubled element says nothing to a reader. */
const SRC = "0x0000000000000000000000000000000000009001";
const VALUES = [3n, 1n, 4n, 1n, 5n, 9n, 2n, 6n];
const ARR = `${SRC}::{values()(uint256[])}`;

const PREAMBLE = [
  // Off-chain lambdas.
  'def @dbl "$x: number -> number" @num($x * 2)',
  'def @big "$x: number -> bool" @bool($x > 3)',
  'def @zero "$x: number -> bool" @bool($x == 0)',
  'def @addTo "$acc: number $x: number -> number" @num($acc + $x)',
  // On-chain lambdas, written independently of the ones above.
  'def @dbl! "$x: number -> number" @num!($x * 2)',
  'def @big! "$x: number -> bool" @bool!($x > 3)',
  'def @zero! "$x: number -> bool" @bool!($x == 0)',
  'def @addTo! "$acc: number $x: number -> number" @num!($acc + $x)',
].join("\n");

describeParity("@lang lambdas", {
  module: "lang [@map @filter @reduce @any @all @find]",
  helpers,
  preamble: PREAMBLE,
  setup: (client) =>
    installConstantMock(
      client,
      SRC,
      encodeAbiParameters([{ type: "uint256[]" }], [VALUES]),
    ),
  cases: [
    {
      // One Operators call per element: the template is spliced at the single
      // offset the parameter occupies.
      name: "map doubles every element",
      run: `@map(${ARR} @dbl)`,
      compile: `@map!(${ARR} @dbl!)`,
      decodeAs: "uint256[]",
    },
    {
      name: "filter keeps the elements above a bound",
      run: `@filter(${ARR} @big)`,
      compile: `@filter!(${ARR} @big!)`,
      decodeAs: "uint256[]",
    },
    {
      // The bare-name reducer: no accumulator body, the fold does it.
      name: "reduce sums with the bare add reducer",
      run: `@reduce(${ARR} @addTo 0)`,
      compile: `@reduce!(${ARR} add 0)`,
    },
    {
      // The two-parameter def: an accumulator window beside the element one.
      name: "reduce sums with a two-parameter def",
      run: `@reduce(${ARR} @addTo 0)`,
      compile: `@reduce!(${ARR} @addTo! 0)`,
    },
    {
      name: "any finds an element above a bound",
      run: `@any(${ARR} @big)`,
      compile: `@any!(${ARR} @big!)`,
    },
    {
      // The negative direction: a predicate nothing satisfies must come back
      // false, not merely fail to come back true.
      name: "any is false when nothing matches",
      run: `@any(${ARR} @zero)`,
      compile: `@any!(${ARR} @zero!)`,
    },
    {
      name: "all is false when one element fails the predicate",
      run: `@all(${ARR} @big)`,
      compile: `@all!(${ARR} @big!)`,
    },
    {
      name: "find returns the first matching element",
      run: `@find(${ARR} @big)`,
      compile: `@find!(${ARR} @big!)`,
    },
    {
      // Composition: the mapped payload feeds the fold, so the map template
      // and the reduce fold have to agree about the payload's shape.
      name: "reduce over a mapped array composes",
      run: `@reduce(@map(${ARR} @dbl) @addTo 0)`,
      compile: `@reduce!(@map!(${ARR} @dbl!) add 0)`,
    },
  ],
});
