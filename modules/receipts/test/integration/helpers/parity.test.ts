import "../../setup";
import { describeParity } from "@evmcrispr/test-utils/onchain";
import { helpers } from "../../../src/_generated";

/**
 * @receipts' block context.
 *
 * The two faces answer different questions by design: the plain one reads a
 * SEALED block (latest by default), the `!` one reads the block being written.
 * On a static fork "latest sealed" and "the block an eth_call executes against"
 * are the same block, which is what makes them comparable at all — and is
 * itself worth pinning, because a drift of one block would show up here.
 */

describeParity("@receipts", {
  module:
    "receipts [@block.number @block.timestamp @block.coinbase @block.gaslimit @block.basefee @block.prevrandao]",
  helpers,
  cases: [
    {
      name: "block number",
      run: "@block.number()",
      compile: "@block.number!()",
    },
    {
      name: "block timestamp",
      run: "@block.timestamp()",
      compile: "@block.timestamp!()",
    },
    {
      // The sealed block has a real validator; the block "being written" by a
      // read-only eth_call has none, so COINBASE reads zero. That is the
      // compileDescription's "reads the block being written" taken literally,
      // and it means an assertion cannot check who proposed a past block.
      name: "diverges: coinbase has no proposer in a read-only call",
      run: "@block.coinbase()",
      compile: "@block.coinbase!()",
      helper: "block.coinbase",
      diverges: {
        reason: "an eth_call is not proposed by anyone, so COINBASE is zero",
      },
    },
    {
      name: "block gas limit",
      run: "@block.gaslimit()",
      compile: "@block.gaslimit!()",
    },
    {
      // The sealed block carries the base fee it was mined with; the block
      // being written has one DERIVED from it by the 1559 rule, so an empty
      // pending block decays towards the floor. Number, timestamp, gaslimit
      // and prevrandao all carry over unchanged — the base fee is the one
      // that is recomputed, which is what "the block being written" costs.
      name: "diverges: base fee is recomputed for the block being written",
      run: "@block.basefee()",
      compile: "@block.basefee!()",
      helper: "block.basefee",
      diverges: {
        reason: "the pending block's base fee is derived, not the sealed one",
      },
    },
    {
      name: "block prevrandao",
      run: "@block.prevrandao()",
      compile: "@block.prevrandao!()",
    },
  ],
});
