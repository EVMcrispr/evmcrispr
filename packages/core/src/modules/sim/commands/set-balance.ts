import { numberToHex } from "viem";

import { ErrorException } from "../../../errors";
import { defineCommand } from "../../../utils";
import type { Sim } from "..";

export default defineCommand<Sim>({
  name: "set-balance",
  args: [
    { name: "address", type: "address" },
    { name: "amount", type: "number" },
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
