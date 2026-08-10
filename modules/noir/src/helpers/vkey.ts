import { defineHelper } from "@evmcrispr/sdk";
import { bytesToHex } from "viem";
import type Noir from "..";
import { buildOracle, getVkey } from "../utils/barretenberg";
import { compileNoirCached } from "../utils/noir";

export default defineHelper<Noir>({
  name: "vkey",
  description:
    "Compile Noir source and return its UltraHonk verification key as 0x-hex bytes, for @noir:verify off-chain checks. Defaults to the keccak (EVM) transcript so it matches proofs from noir:prove; pass oracle:poseidon for bb's native transcript.",
  returnType: "string",
  args: [
    {
      name: "source",
      type: "string",
      description: "Noir source code, or a http(s)/ipfs URL to fetch it from",
    },
    {
      name: "oracle",
      type: "string",
      namedOnly: true,
      description:
        "Proof transcript: `oracle:keccak` (default) or `oracle:poseidon`",
    },
  ],
  async run(module, { source, oracle }) {
    const ctx = {
      log: (message: string) => module.context.log(message),
      fetchIpfs: (cidPath: string) => module.ipfsResolver.bytes(cidPath),
    };
    const compiled = await compileNoirCached(String(source), ctx);
    const vkey = await getVkey(
      compiled.compileKey,
      compiled.program,
      buildOracle(oracle),
      ctx,
    );
    return bytesToHex(vkey);
  },
});
