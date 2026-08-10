import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import { encodeOperator, opsCall } from "@evmcrispr/sdk/onchain";
import type Receipts from "..";
import { blobBaseFeeUpdateFraction } from "../utils/blobSchedule";
import { blockClientFor, resolveBlock } from "../utils/blockContext";

/** EIP-4844 blob base fee floor. The DENOMINATOR is not a constant — it
 *  changes at Cancun, Prague and each BPO fork — so it is looked up per chain
 *  and block in ../utils/blobSchedule. */
const MIN_BLOB_BASE_FEE = 1n;

/**
 * The EIP-4844 `fake_exponential(factor, numerator, denominator)`:
 * an integer-only Taylor expansion of `factor * e**(numerator/denominator)`.
 * A sealed block's blob base fee is
 * `fake_exponential(1, excessBlobGas, <the fork's denominator>)`.
 */
function fakeExponential(
  factor: bigint,
  numerator: bigint,
  denominator: bigint,
): bigint {
  let i = 1n;
  let output = 0n;
  let accum = factor * denominator;
  while (accum > 0n) {
    output += accum;
    accum = (accum * numerator) / (denominator * i);
    i += 1n;
  }
  return output / denominator;
}

export default defineHelper<Receipts>({
  name: "block.blobBaseFee",
  batchable: false,
  description:
    "Blob base fee in wei: the live value with no arguments, or the EIP-4844 value of a sealed block computed from its excess blob gas (blocks predating EIP-4844 error).",
  compileDescription: "Reads the block being written, and takes no arguments.",
  returnType: "number",
  args: [
    {
      name: "block",
      type: ["number", "string"],
      optional: true,
      description: "Block number or tag (default: latest)",
    },
    {
      name: "chain",
      type: "chain",
      optional: true,
      description: "Chain to look on (default: current chain)",
    },
  ],
  async run(module, { block, chain }) {
    // No block address: the node's own view (the eth_blobBaseFee RPC).
    if (block === undefined) {
      const { client } = await blockClientFor(module, chain);
      return Num(await client.getBlobBaseFee());
    }
    // A sealed block: recompute its blob base fee from the header, per
    // EIP-4844: fake_exponential(MIN_BLOB_BASE_FEE, excessBlobGas,
    // BLOB_BASE_FEE_UPDATE_FRACTION).
    const sealed = await resolveBlock(module, block, chain);
    if (sealed.excessBlobGas === undefined || sealed.excessBlobGas === null) {
      throw new ErrorException(
        `block ${sealed.number} predates EIP-4844 and carries no excess blob gas`,
      );
    }
    // A quiet chain needs no schedule: with no excess, the exponential is the
    // floor whatever the denominator. Checking first means chains whose fork
    // schedule is unknown still answer here, and only a chain with real blob
    // demand has to be priced.
    if (sealed.excessBlobGas === 0n) return Num(MIN_BLOB_BASE_FEE);
    // The chain the BLOCK is on, not the module's — the caller may have
    // passed `mainnet` while connected elsewhere, and the fork schedule
    // belongs to the block.
    const { chainId } = await blockClientFor(module, chain);
    return Num(
      fakeExponential(
        MIN_BLOB_BASE_FEE,
        sealed.excessBlobGas,
        blobBaseFeeUpdateFraction(chainId, sealed.timestamp),
      ),
    );
  },
  compile: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@block.blobBaseFee! takes no arguments");
    return opsCall(ctx, encodeOperator("blobBaseFee"), "Uint");
  },
});
