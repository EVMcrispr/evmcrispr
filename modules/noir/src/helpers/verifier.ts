import { defineHelper } from "@evmcrispr/sdk";
import type Noir from "..";
import { getVerifierSource } from "../utils/barretenberg";
import { compileNoirCached } from "../utils/noir";

export default defineHelper<Noir>({
  name: "verifier",
  description:
    "Compile Noir source and return the Solidity UltraHonk verifier contract source (always the keccak/EVM transcript), ready to pipe through @contracts:solidity and contracts:deploy, then call verify(bytes,bytes32[])(bool) with the tuple from @noir:proof. Shares the compile cache with noir:prove --noir, so deployed verifier and generated proofs always match.",
  returnType: "string",
  args: [
    {
      name: "source",
      type: "string",
      description: "Noir source code, or a http(s)/ipfs URL to fetch it from",
    },
  ],
  async run(module, { source }) {
    const ctx = {
      log: (message: string) => module.context.log(message),
      fetchIpfs: (cidPath: string) => module.ipfsResolver.bytes(cidPath),
    };
    const compiled = await compileNoirCached(String(source), ctx);
    return getVerifierSource(compiled.compileKey, compiled.program, ctx);
  },
});
