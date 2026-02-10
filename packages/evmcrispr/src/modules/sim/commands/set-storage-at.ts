import { numberToHex } from "viem";

import { ErrorException } from "../../../errors";

import type { ICommand } from "../../../types";

import { ComparisonType, checkArgsLength } from "../../../utils";

import type { Sim } from "../Sim";

export const setStorageAt: ICommand<Sim> = {
  async run(module, c, { interpretNodes }) {
    checkArgsLength(c, {
      type: ComparisonType.Equal,
      minValue: 3,
    });

    if (!module.mode) {
      throw new ErrorException(
        "set-storage-at can only be used inside a fork block",
      );
    }

    const [address, slot, value] = await interpretNodes(c.args);

    if (typeof address !== "string") {
      throw new ErrorException("address must be a string");
    }

    if (typeof value !== "string") {
      throw new ErrorException("value must be a hex string");
    }

    // Slot can be a number (bigint) or a hex hash
    const slotHex =
      typeof slot === "bigint" ? numberToHex(slot) : (slot as string);

    return [
      {
        type: "rpc",
        method: `${module.mode}_setStorageAt`,
        params: [address, slotHex, value],
      },
    ];
  },
  async runEagerExecution() {
    return;
  },
  buildCompletionItemsForArg() {
    return [];
  },
};
