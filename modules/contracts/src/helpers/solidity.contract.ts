import { defineHelper } from "@evmcrispr/sdk";
import type Contracts from "..";
import { compileCached } from "../utils/solcLoader";

export default defineHelper<Contracts>({
  name: "solidity.contract",
  description:
    "Compile Solidity source (inline text or a http/ipfs URL) and return the qualified contract name (`File.sol:Contract`), ready for `verify --contract-name`. Pass the same options as the matching @solidity call so the cached compile is reused.",
  returnType: "string",
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
        fetchIpfs: (cidPath) => module.ipfsResolver.text(cidPath),
      },
    );
    return result.qualifiedName;
  },
});
