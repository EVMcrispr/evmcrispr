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
const SUPPLY = `${WXDAI}::{totalSupply()(uint256)}`;
const DEC = `${WXDAI}::{decimals()(uint8)}`;
const WORDS = `${POOL}::{getReservesList()(uint256[])}`;

describeParity("@math", {
  module: "math [@max @min @absdiff @sqrt @log2 @ln @exp @pow]",
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
    // ---- the single-operand functions, over live reads --------------------
    {
      name: "absdiff never underflows, either way round",
      run: `@absdiff(${DEC} ${SUPPLY})`,
      compile: `@absdiff!(${DEC} ${SUPPLY})`,
    },
    {
      name: "absdiff with the larger operand first",
      run: `@absdiff(${SUPPLY} ${DEC})`,
      compile: `@absdiff!(${SUPPLY} ${DEC})`,
    },
    {
      name: "sqrt of a live read",
      run: `@sqrt(${SUPPLY})`,
      compile: `@sqrt!(${SUPPLY})`,
    },
    {
      // The on-chain face takes a whole EXPRESSION; the plain one takes a
      // number, so the product is folded with @num first.
      name: "sqrt of a live product, the geometric-mean shape",
      run: `@sqrt(@num(${SUPPLY} * ${DEC}))`,
      compile: `@sqrt!(${SUPPLY} * ${DEC})`,
    },
    {
      name: "log2 is the bit position, not a logarithm",
      run: `@log2(${SUPPLY})`,
      compile: `@log2!(${SUPPLY})`,
    },
    {
      // The on-chain operand carries scale 18, so it resolves to the REAL
      // value; the plain face returns the raw wad integer. Same number, and
      // only the on-chain side knows it is scaled — the same gap that makes
      // @pow's default base undecidable off-chain.
      name: "diverges: ln carries its wad scale on-chain only",
      run: `@ln(${SUPPLY})`,
      compile: `@ln!(${SUPPLY})`,
      helper: "ln",
      diverges: { reason: "the on-chain operand carries scale 18" },
    },
    {
      name: "diverges: exp carries its wad scale on-chain only",
      run: `@exp(${DEC})`,
      compile: `@exp!(${DEC})`,
      helper: "exp",
      diverges: { reason: "the on-chain operand carries scale 18" },
    },
    {
      // base passed explicitly: with it omitted the on-chain face takes the
      // unit from the operand's scale and the off-chain one cannot see a
      // scale, which is the declared divergence.
      name: "pow compounds with an explicit base",
      run: `@pow(1050000000000000000 10 1000000000000000000)`,
      compile: `@pow!(1050000000000000000 10 1000000000000000000)`,
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
