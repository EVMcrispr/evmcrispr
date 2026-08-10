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

/** A distinctive proposer, so the coinbase case cannot pass on zero==zero. */
const COINBASE = "0x1111111111111111111111111111111111111111";

describeParity("@receipts", {
  module:
    "receipts [@block.number @block.timestamp @block.coinbase @block.baseFee @block.gasLimit @block.prevrandao @block.blobBaseFee @chainId]",
  helpers,
  setup: async (client) => {
    // Idempotent: only mines when the head is not already anvil's own block
    // with the coinbase we want.
    const head = await client.getBlock();
    if (head.miner?.toLowerCase() === COINBASE.toLowerCase()) return;
    await client.request({
      method: "anvil_setCoinbase",
      params: [COINBASE],
    } as never);
    await client.request({ method: "evm_mine", params: [] } as never);
  },
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
      // Non-zero by construction, so this cannot pass on anvil's default zero.
      name: "block coinbase",
      run: "@block.coinbase()",
      compile: "@block.coinbase!()",
    },
    {
      name: "block base fee",
      run: "@block.baseFee()",
      compile: "@block.baseFee!()",
    },
    {
      name: "block gas limit",
      run: "@block.gasLimit()",
      compile: "@block.gasLimit!()",
    },
    {
      // Two genuinely different routes to the same number: the plain face
      // asks the node (eth_blobBaseFee), the ! face reads the BLOBBASEFEE
      // opcode through Operators.
      //
      // Worth knowing what this does and does not pin: it is 1 on both sides,
      // and NOT because the chain is quiet. Anvil does not model blob fees on
      // a fork — eth_blobBaseFee answers 0x1 and BLOBBASEFEE reads the same
      // stub — so both faces read anvil rather than the chain. Measured on a
      // MAINNET fork whose head carried excessBlobGas of 183 million, where
      // the plain face's sealed-block path computes ~6.9e23 wei while the
      // live path still answers 1.
      //
      // So this pins the plumbing (the operand compiles, resolves and decodes)
      // and not the value. Exercising the exponential needs a node that
      // models blob fees, which anvil is not.
      name: "blob base fee, which anvil stubs to 1 on either chain",
      run: "@block.blobBaseFee()",
      compile: "@block.blobBaseFee!()",
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
