import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import { numberToHex } from "viem";
import type Sim from "..";

export default defineCommand<Sim>({
  name: "set-balance",
  description: "Set the ETH balance of an account in a fork simulation.",
  args: [
    {
      name: "address",
      type: "address",
      description: "Contract or account address",
    },
    { name: "amount", type: "number", description: "New balance in wei" },
  ],
  async run(module, { address, amount }) {
    if (!module.mode) {
      throw new ErrorException(
        "set-balance can only be used inside a fork block",
      );
    }

    return [
      {
        type: "rpc",
        method: `${module.mode}_setBalance`,
        params: [address, numberToHex(BigInt(amount))],
      },
    ];
  },
});
