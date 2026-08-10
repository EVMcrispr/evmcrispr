import "../../setup";
import { describeParity } from "@evmcrispr/test-utils/onchain";
import { helpers } from "../../../src/_generated";

/**
 * @std's both-faced helpers.
 *
 * `@num!`, `@bool!` and `@bytes!` are the expression engine's entry points
 * rather than single reads: each composes live calls and constants into on-chain
 * arithmetic, logic or word ops. Their parity matters more than most, because
 * everything else that takes an expression argument goes through them.
 */

const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
const HOLDER = "0xd0Dd6cEF72143E22cCED4867eb0d5F2328715533";

const SUPPLY = `${WXDAI}::{totalSupply()(uint256)}`;
const DEC = `${WXDAI}::{decimals()(uint8)}`;

describeParity("@std", {
  helpers,
  cases: [
    // ---- @num!: arithmetic over live reads ---------------------------------
    {
      name: "num adds a constant to a live read",
      run: `@num(${DEC} + 4)`,
      compile: `@num!(${DEC} + 4)`,
    },
    {
      name: "num multiplies and divides two live reads",
      run: `@num(${SUPPLY} / ${DEC})`,
      compile: `@num!(${SUPPLY} / ${DEC})`,
    },
    {
      name: "num applies precedence across several live terms",
      run: `@num(${DEC} * 2 + 1)`,
      compile: `@num!(${DEC} * 2 + 1)`,
    },
    {
      name: "num takes a modulus",
      run: `@num(${SUPPLY} % 1000)`,
      compile: `@num!(${SUPPLY} % 1000)`,
    },

    // ---- @bool!: comparison and logic --------------------------------------
    {
      name: "bool compares a live read against a constant",
      run: `@bool(${DEC} == 18)`,
      compile: `@bool!(${DEC} == 18)`,
    },
    {
      name: "bool ands two live comparisons",
      run: `@bool(${DEC} == 18 and ${SUPPLY} > 0)`,
      compile: `@bool!(${DEC} == 18 and ${SUPPLY} > 0)`,
    },
    {
      // The false branch matters as much: a predicate that does not hold must
      // come back false rather than merely failing to come back true.
      name: "bool is false when the comparison does not hold",
      run: `@bool(${DEC} == 6)`,
      compile: `@bool!(${DEC} == 6)`,
    },
    {
      name: "bool negates",
      run: `@bool(not ${DEC} == 6)`,
      compile: `@bool!(not ${DEC} == 6)`,
    },

    // ---- @bytes!: word operations ------------------------------------------
    {
      // Declared: off-chain the result is minimal hex (`0x12`), on-chain it is
      // the raw 32-byte word, which resolve hands back as the number 18. The
      // two agree on the VALUE and differ on the width, which is what the
      // compileDescription means by "the raw word cast".
      name: "diverges: bytes is minimal hex off-chain, a full word on-chain",
      run: `@bytes(${DEC})`,
      compile: `@bytes!(${DEC})`,
      helper: "bytes",
      diverges: { reason: "the on-chain face works on full 32-byte words" },
    },
    {
      name: "diverges: a shifted word keeps that width difference",
      run: `@bytes(${DEC} "<<" 8)`,
      compile: `@bytes!(${DEC} "<<" 8)`,
      helper: "bytes",
      diverges: { reason: "the on-chain face works on full 32-byte words" },
    },
    {
      // `^` was on-chain only until now: @bytes! accepted it and @bytes threw
      // "Operator ^ not recognized", so the same expression compiled but would
      // not run. The width difference below is the declared part.
      name: "diverges: xor agrees on the value, differs on the width",
      run: `@bytes(${DEC} "xor" 255)`,
      compile: `@bytes!(${DEC} "xor" 255)`,
      helper: "bytes",
      diverges: { reason: "the on-chain face works on full 32-byte words" },
    },

    // ---- @hash! -------------------------------------------------------------
    {
      // Hashes the DECODED payload a call returns, not its ABI envelope, so
      // this is keccak of the symbol string itself.
      name: "hash digests the decoded string a call returns",
      run: `@hash(${WXDAI}::{symbol()(string)})`,
      compile: `@hash!(${WXDAI}::{symbol()(string)})`,
    },

    // ---- @balance! ----------------------------------------------------------
    {
      // The token list has no ETH on Gnosis, whose native token is xDAI, so
      // this reads an ERC-20 balance by address instead.
      name: "balance reads an ERC-20 balance",
      run: `@balance(${WXDAI} ${HOLDER})`,
      compile: `@balance!(${WXDAI} ${HOLDER})`,
    },
  ],
});
