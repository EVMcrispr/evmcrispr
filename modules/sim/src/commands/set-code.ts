import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Sim from "..";

export default defineCommand<Sim>({
  name: "set-code",
  args: [
    { name: "address", type: "string" },
    { name: "bytecode", type: "string" },
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
