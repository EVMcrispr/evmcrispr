import { encode } from "@ensdomains/content-hash";
import { defineHelper } from "@evmcrispr/sdk";
import type Ens from "..";

export default defineHelper<Ens>({
  name: "contenthash",
  description: "Encode a content hash (ipfs, ipns, skynet) for ENS records.",
  returnType: "bytes32",
  args: [{ name: "input", type: "string", description: "Content hash (e.g. \"ipfs:Qm...\")" }],
  async run(_, { input }) {
    const [codec, hash] = input.split(":");
    if (!["ipfs", "ipns", "skynet"].includes(codec)) {
      throw new Error(
        "Only ipfs, ipns and skynet are supported. The hash format should be <codec>:<hash>",
      );
    }
    if (!hash) {
      throw new Error("The hash format should be <codec>:<hash>");
    }
    return `0x${encode(`${codec}-ns` as "ipfs" | "ipns" | "skynet", hash)}`;
  },
});
