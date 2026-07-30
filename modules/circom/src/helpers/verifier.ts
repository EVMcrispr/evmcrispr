import { defineHelper } from "@evmcrispr/sdk";
import type Circom from "..";
import { buildCircomSetupOptions, setupCached } from "../utils/setup";

export default defineHelper<Circom>({
  name: "verifier",
  description:
    "Compile circom source (inline text or a http/ipfs URL), run an in-place setup, and return the Solidity verifier source with the verification key embedded — pipe it into @contracts:solidity to deploy. groth16 setups are DEV-ONLY (no ceremony); plonk/fflonk setups are deterministic and production-grade given a real powers-of-tau.",
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
      description: "Proof system: `system:groth16|plonk|fflonk` (default groth16)",
    },
  ],
  async run(module, { source, ptau, system }) {
    const parsed = buildCircomSetupOptions({ ptau, system });
    const { verifierSource } = await setupCached(String(source), parsed, {
      log: (message) => module.context.log(message),
      fetchIpfs: (cidPath) => module.ipfsResolver.bytes(cidPath),
    });
    return verifierSource;
  },
});
