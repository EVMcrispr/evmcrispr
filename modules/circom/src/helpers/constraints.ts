import { defineHelper, Num } from "@evmcrispr/sdk";
import type Circom from "..";
import { compileCircomCached } from "../utils/circom";

export default defineHelper<Circom>({
  name: "constraints",
  description:
    "Compile circom source (inline text or a http/ipfs URL) and return its constraint count, useful to size the powers-of-tau a setup needs (a 2^p ptau supports up to 2^p constraints).",
  returnType: "number",
  args: [
    {
      name: "source",
      type: "string",
      description: "circom source code, or a http(s)/ipfs URL to fetch it from",
    },
  ],
  async run(module, { source }) {
    const { constraints } = await compileCircomCached(String(source), {
      log: (message) => module.context.log(message),
      fetchIpfs: (cidPath) => module.ipfsResolver.bytes(cidPath),
    });
    return Num.fromBigInt(BigInt(constraints));
  },
});
