import "../../setup";
import { describeParity } from "@evmcrispr/test-utils/onchain";
import { helpers } from "../../../src/_generated";

/**
 * @math's two faces, compared by value.
 *
 * The array shape is the point here: `@max([1 2 3])` is what the argument
 * description has always promised and what `@max!` has always accepted, but
 * the off-chain face used to reject it — so the form was on-chain-only for no
 * reason a caller could see.
 */

const POOL = "0xb50201558B00496A145fE76f7424749556E326D8";
const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
const WORDS = `${POOL}::{getReservesList()(uint256[])}`;

describeParity("@math", {
  module: "math [@max @min]",
  helpers,
  cases: [
    {
      name: "max of a constant array",
      run: "@max([1 2 3])",
      compile: "@max!([1 2 3])",
    },
    {
      // Constant operands fold at composition time, so the two cases above
      // never reach the chain. These two do: both operands are live reads,
      // so arithCombine's Max/Min really run through Operators.
      name: "max of two live reads",
      run: `@max(${WXDAI}::{totalSupply()(uint256)} ${WXDAI}::{decimals()(uint8)})`,
      compile: `@max!(${WXDAI}::{totalSupply()(uint256)} ${WXDAI}::{decimals()(uint8)})`,
    },
    {
      name: "min of two live reads",
      run: `@min(${WXDAI}::{totalSupply()(uint256)} ${WXDAI}::{decimals()(uint8)})`,
      compile: `@min!(${WXDAI}::{totalSupply()(uint256)} ${WXDAI}::{decimals()(uint8)})`,
    },
    {
      name: "min of a constant array",
      run: "@min([7 3 9])",
      compile: "@min!([7 3 9])",
    },
    {
      // The on-chain face builds an operand list at composition time, so it
      // needs the operands written out. An array a call returns has no form
      // here — unlike @sum!, which folds a words payload.
      name: "refuses: an array a call returns",
      run: `@max(${WORDS})`,
      compile: `@max!(${WORDS})`,
      helper: "max",
      refuses: /needs at least two operands/,
    },
  ],
});
