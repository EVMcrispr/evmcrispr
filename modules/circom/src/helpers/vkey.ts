import { defineHelper } from "@evmcrispr/sdk";
import type Circom from "..";
import { buildCircomSetupOptions, setupCached } from "../utils/setup";

export default defineHelper<Circom>({
  name: "vkey",
  description:
    "Compile circom source, run the in-place setup and return the verification key as JSON, for @circom:verify off-chain checks. Shares the compile and setup caches with @circom:verifier and circom:prove --circom.",
  returnType: "string",
  args: [
    {
      name: "source",
      type: "string",
      description: "circom source code, or a http(s)/ipfs URL to fetch it from",
    },
    {
      name: "ptau",
      type: "string",
      namedOnly: true,
      description:
        "Powers-of-tau: `ptau:dev` or `ptau:<url>` (default: auto-download a hez file sized to the circuit)",
    },
    {
      name: "system",
      type: "string",
      namedOnly: true,
      description:
        "Proof system: `system:groth16|plonk|fflonk` (default groth16)",
    },
  ],
  async run(module, { source, ptau, system }) {
    const parsed = buildCircomSetupOptions({ ptau, system });
    const { vkeyJson } = await setupCached(String(source), parsed, {
      log: (message) => module.context.log(message),
      fetchIpfs: (cidPath) => module.ipfsResolver.bytes(cidPath),
    });
    return vkeyJson;
  },
});
