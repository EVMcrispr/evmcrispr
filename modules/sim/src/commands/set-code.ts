import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Sim from "..";

export default defineCommand<Sim>({
  name: "set-code",
  description: "Set the bytecode at an address in a fork simulation.",
  args: [
    {
      name: "address",
      type: "string",
      description: "Contract or account address",
    },
    { name: "bytecode", type: "string", description: "New bytecode to set" },
  ],
  async run(module, { address, bytecode }) {
    if (!module.mode) {
      throw new ErrorException("set-code can only be used inside a fork block");
    }

    return [
      {
        type: "rpc",
        method: `${module.mode}_setCode`,
        params: [address, bytecode],
      },
    ];
  },
});
