import { defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "block",
  description: "Return [number, timestamp] of the latest or a specific block.",
  returnType: "any",
  args: [
    {
      name: "blockNumber",
      type: "number",
      description: "Block number (omit for latest)",
      optional: true,
    },
  ],
  async run(module, { blockNumber }) {
    const client = await module.getClient();
    const block = await client.getBlock(
      blockNumber !== undefined
        ? { blockNumber: BigInt(String(blockNumber)) }
        : undefined,
    );
    return [block.number.toString(), block.timestamp.toString()];
  },
});
