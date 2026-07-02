import { defineHelper } from "@evmcrispr/sdk";
import type Ens from "..";
import { encodeContenthash } from "../utils";

export default defineHelper<Ens>({
  name: "contenthash",
  description: "Encode a content hash (ipfs, ipns, skynet) for ENS records.",
  returnType: "bytes",
  args: [
    {
      name: "input",
      type: "string",
      description: 'Content hash (e.g. "ipfs:Qm...")',
    },
  ],
  async run(_, { input }) {
    return encodeContenthash(input);
  },
});
