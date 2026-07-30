import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "ipfs.get",
  description:
    "Fetch content from IPFS, verified against its CID, and return it as text.",
  returnType: "string",
  args: [
    {
      name: "cid",
      type: "string",
      description: "Content identifier to fetch",
    },
  ],
  async run(module, { cid }) {
    try {
      return await module.ipfsResolver.text(String(cid));
    } catch (err: unknown) {
      throw new ErrorException(
        `@ipfs.get: ${err instanceof Error ? err.message : err}`,
      );
    }
  },
});
