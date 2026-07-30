import { defineHelper } from "@evmcrispr/sdk";
import type Contracts from "..";
import { buildCompileOptions } from "../utils/solc";
import { compileCached } from "../utils/solcLoader";

export default defineHelper<Contracts>({
  name: "solidity",
  description:
    "Compile Solidity source (inline text or a http/ipfs URL) and return the creation bytecode, ready for `deploy`. Options: version:<x.y.z>, runs:<n>, optimizer:false, via-ir:true, evm:<version>, contract:<Name>, libraries:[[Name 0x…]].",
  returnType: "bytes",
  experimental: true,
  args: [
    {
      name: "source",
      type: "string",
      description: "Solidity source code, or a URL to fetch it from",
    },
    {
      name: "version",
      type: "string",
      namedOnly: true,
      description:
        "Compiler release, e.g. `version:0.8.26` (default: from the pragma)",
    },
    {
      name: "runs",
      type: "number",
      namedOnly: true,
      description: "Optimizer runs, e.g. `runs:1000` (default: 200)",
    },
    {
      name: "optimizer",
      type: "bool",
      namedOnly: true,
      description: "`optimizer:false` disables the optimizer",
    },
    {
      name: "via-ir",
      type: "bool",
      namedOnly: true,
      description: "`via-ir:true` compiles through the IR pipeline",
    },
    {
      name: "evm",
      type: "string",
      namedOnly: true,
      description: "EVM version, e.g. `evm:cancun`",
    },
    {
      name: "contract",
      type: "string",
      namedOnly: true,
      description: "Target contract name when the source defines several",
    },
    {
      name: "libraries",
      type: "any",
      namedOnly: true,
      description:
        "Deployed library addresses to link, as an entries array: `libraries:[[LibName 0x…] …]` — needed when the source's libraries have external functions",
    },
  ],
  async run(module, { source, ...options }) {
    const result = await compileCached(
      String(source),
      buildCompileOptions(options),
      {
        log: (m) => module.context.log(m),
        fetchIpfs: (cidPath) => module.ipfsResolver.text(cidPath),
      },
    );
    return result.bytecode;
  },
});
