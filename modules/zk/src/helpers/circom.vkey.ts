import { defineHelper } from "@evmcrispr/sdk";
import type Zk from "..";
import { parseCircomSetupOptions, setupCached } from "../utils/setup";

export default defineHelper<Zk>({
  name: "circom.vkey",
  description:
    "Compile circom source, run the in-place setup and return the verification key as JSON — feed it to @zk:verify for off-chain checks. Shares the compile and setup caches with @zk:circom.verifier and zk:prove --circom.",
  returnType: "string",
  args: [
    {
      name: "source",
      type: "string",
      description: "circom source code, or a http(s)/ipfs URL to fetch it from",
    },
    {
      name: "options",
      type: "string",
      rest: true,
      description:
        "Setup options: ptau:dev, ptau:<url>, system:groth16|plonk|fflonk",
    },
  ],
  async run(module, { source, options }) {
    const parsed = parseCircomSetupOptions(
      ((options as string[]) ?? []).map(String),
    );
    const { vkeyJson } = await setupCached(String(source), parsed, {
      log: (message) => module.context.log(message),
      fetchIpfs: (cidPath) => module.ipfsResolver.bytes(cidPath),
    });
    return vkeyJson;
  },
});
