import { defineHelper } from "@evmcrispr/sdk";
import type Noir from "..";
import { compileNoirCached } from "../utils/noir";

export default defineHelper<Noir>({
  name: "compile",
  description:
    "Compile Noir source in-place and return the compiled program artifact as JSON (the nargo target/*.json shape, debug payload stripped) — host it and prove later with noir:prove --artifact. Single-file circuits with the stdlib only; shares the compile cache with the other @noir helpers and noir:prove --noir.",
  returnType: "string",
  args: [
    {
      name: "source",
      type: "string",
      description: "Noir source code, or a http(s)/ipfs URL to fetch it from",
    },
  ],
  async run(module, { source }) {
    const { artifactJson } = await compileNoirCached(String(source), {
      log: (message) => module.context.log(message),
      fetchIpfs: (cidPath) => module.ipfsResolver.bytes(cidPath),
    });
    return artifactJson;
  },
});
