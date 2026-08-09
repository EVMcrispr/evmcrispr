import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import { encodeOperator, opsCall } from "@evmcrispr/sdk/onchain";
import type Receipts from "..";
import { blockClientFor, resolveBlock } from "../utils/blockContext";

/** EIP-4844 blob base fee parameters. */
const MIN_BLOB_BASE_FEE = 1n;
const BLOB_BASE_FEE_UPDATE_FRACTION = 3338477n;

/**
 * The EIP-4844 `fake_exponential(factor, numerator, denominator)`:
 * an integer-only Taylor expansion of `factor * e**(numerator/denominator)`.
 * A sealed block's blob base fee is
 * `fake_exponential(1, excessBlobGas, 3338477)`.
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
  name: "block.blobbasefee",
  batchable: false,
  description:
    "The blob base fee in wei: with no block argument the live value over RPC; addressed by number or tag the EIP-4844 value of that sealed block, computed from its excess blob gas (blocks predating EIP-4844 error); as @block.blobbasefee! you read the block being written at assertion time.",
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
    return Num(
      fakeExponential(
        MIN_BLOB_BASE_FEE,
        sealed.excessBlobGas,
        BLOB_BASE_FEE_UPDATE_FRACTION,
      ),
    );
  },
  compile: async (ctx, node) => {
    if (node.args.length > 0)
      throw new ErrorException("@block.blobbasefee! takes no arguments");
    return opsCall(ctx, encodeOperator("blobBaseFee"), "Uint");
  },
});
