import { defineHelper } from "@evmcrispr/sdk";
import type Contracts from "..";
import { compileCached } from "../utils/solcLoader";

export default defineHelper<Contracts>({
  name: "solidity",
  description:
    "Compile Solidity source (inline text or a http/ipfs URL) and return the creation bytecode, ready for `deploy`. Options: version:<x.y.z>, runs:<n>, optimizer:off, via-ir, evm:<version>, contract:<Name>.",
  returnType: "bytes",
  experimental: true,
  args: [
    {
      name: "source",
      type: "string",
      description: "Solidity source code, or a URL to fetch it from",
    },
    {
      name: "options",
      type: "string",
      rest: true,
      description:
        "Compiler options, e.g. `version:0.8.26`, `runs:1000`, `via-ir`",
    },
  ],
  async run(module, { source, options }) {
    const result = await compileCached(
      String(source),
      ((options as string[]) ?? []).map(String),
      {
        log: (m) => module.context.log(m),
        resolveIpfs: (url) =>
          module.ipfsResolver.url(url.replace(/^ipfs:\/\//, "")),
      },
    );
    return result.bytecode;
  },
});
