import "../../setup";
import { it } from "bun:test";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import {
  compileExpression,
  describeParity,
  installAssertionsCore,
  normalizeRun,
  resolveValue,
  runExpression,
  sameValue,
  show,
} from "@evmcrispr/test-utils/onchain";
import { helpers } from "../../../src/_generated";

/**
 * @receipts' block and chain context.
 *
 * The two faces answer different questions by design: the plain one reads a
 * SEALED block (latest by default), the `!` one reads the block being written.
 * On a static fork "latest sealed" and "the block an eth_call executes against"
 * are the same block, which is what makes them comparable at all — and is
 * itself worth pinning, because a drift of one block would show up here.
 */

describeParity("@receipts", {
  module:
    "receipts [@block.number @block.timestamp @block.coinbase @block.gasLimit @block.baseFee @block.prevrandao @chainId]",
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
      run: "@block.gasLimit()",
      compile: "@block.gasLimit!()",
    },
    {
      // The sealed block carries the base fee it was mined with; the block
      // being written has one DERIVED from it by the 1559 rule, so an empty
      // pending block decays towards the floor. Number, timestamp, gas limit
      // and prevrandao all carry over unchanged — the base fee is the one
      // that is recomputed, which is what "the block being written" costs.
      name: "diverges: base fee is recomputed for the block being written",
      run: "@block.baseFee()",
      compile: "@block.baseFee!()",
      helper: "block.baseFee",
      diverges: {
        reason: "the pending block's base fee is derived, not the sealed one",
      },
    },
    {
      name: "block prevrandao",
      run: "@block.prevrandao()",
      compile: "@block.prevrandao!()",
    },
    {
      // Off-chain this is the chain the script was composed against; on-chain
      // it is the CHAINID of the chain judging the assertion.
      name: "chain id agrees when composed and judged on the same chain",
      run: "@chainId()",
      compile: "@chainId!()",
    },
  ],
});

/**
 * `@block.hash` needs the block number written into BOTH expressions as the
 * same literal, so it cannot go through describeParity, whose cases are fixed
 * before anything runs.
 *
 * An earlier attempt compared `@block.hash(@block.number() - 10)` against the
 * banged spelling of the same thing, and that was the bug: the plain face
 * reads the latest SEALED block while the ! face reads the block being
 * written, so the two sides were resolving different blocks and then
 * comparing their hashes.
 *
 * Only the previous block is checked. BLOCKHASH reaches back 256 blocks on a
 * real chain, but anvil only knows hashes for blocks it holds locally, so
 * anything further back reads 0 here — measured: at -10 and -200 the plain
 * face returns the real hash and the ! face returns nothing. That is a
 * property of the fork, not of the EVM, so it is not pinned as a divergence:
 * doing so would encode an artifact as if it were the rule.
 */
it("@block.hash of the previous block agrees on both faces", async () => {
  const pub = getPublicClient();
  const { core, operators } = await installAssertionsCore(pub);
  // A literal, so both faces resolve the SAME block however the chain moves.
  const target = (await pub.getBlockNumber()) - 1n;
  const env = { module: "receipts [@block.hash]", core, operators };

  const { operand } = await compileExpression(`@block.hash!(${target})`, env);
  const onchain = await resolveValue(pub, operand, { core });
  const offchain = normalizeRun(
    await runExpression(`@block.hash(${target})`, env),
  );

  expect(
    sameValue(offchain, onchain),
    `block.hash(${target})\n  run     -> ${show(offchain)}\n  compile -> ${show(onchain)}`,
  ).to.be.true;
  // Guard against both faces agreeing on nothing.
  expect(
    onchain.t === "hex" && /[1-9a-f]/.test(onchain.v),
    `block hash came back empty (${show(onchain)})`,
  ).to.be.true;
}, 30_000);
