import { defineHelper } from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import { getContractAddress, pad } from "viem";
import type Proxies from "..";
import { ARACHNID_CREATE2, cloneInitCode } from "../utils";

export default defineHelper<Proxies>({
  name: "proxies.predictClone",
  description:
    "Predicted address of a deterministic ERC-1167 clone deployed with proxies:clone --salt. Pure computation, no chain read.",
  returnType: "address",
  args: [
    {
      name: "implementation",
      type: "address",
      description: "Implementation contract the clone delegates to",
    },
    { name: "salt", type: "bytes32", description: "CREATE2 salt" },
    {
      name: "deployer",
      type: "address",
      description: "CREATE2 factory (defaults to the Arachnid deployer)",
      optional: true,
    },
  ],
  async run(_module, { implementation, salt, deployer }) {
    return getContractAddress({
      opcode: "CREATE2",
      from: (deployer as Address | undefined) ?? ARACHNID_CREATE2,
      salt: pad(salt as Hex, { size: 32 }),
      bytecode: cloneInitCode(implementation as Address),
    });
  },
});
