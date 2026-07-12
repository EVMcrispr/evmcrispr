import { decode, getCodec } from "@ensdomains/content-hash";
import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import { parseAbi } from "viem";
import { normalize } from "viem/ens";
import type Ens from "..";
import { getNode, mainnetClient } from "../utils";

export default defineHelper<Ens>({
  name: "contenthash.of",
  batchable: false,
  description: "Read the decoded content hash of an ENS name (e.g. ipfs://…).",
  returnType: "string",
  args: [
    {
      name: "name",
      type: "string",
      description: "ENS name (e.g. vitalik.eth)",
    },
  ],
  async run(module, { name }, { node }) {
    const client = mainnetClient(module);
    const resolver = await client.getEnsResolver({ name: normalize(name) });
    if (!resolver) {
      throw new HelperFunctionError(node, `no resolver found for ${name}`);
    }
    const contenthash = await client.readContract({
      address: resolver,
      abi: parseAbi([
        "function contenthash(bytes32 node) view returns (bytes)",
      ]),
      functionName: "contenthash",
      args: [getNode(name)],
    });
    if (!contenthash || contenthash === "0x") {
      throw new HelperFunctionError(node, `no content hash found for ${name}`);
    }
    const encoded = contenthash.slice(2);
    return `${getCodec(encoded)}://${decode(encoded)}`;
  },
});
