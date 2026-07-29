import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import type AccessControl from "..";

export default defineCommand<AccessControl>({
  name: "transfer-ownership",
  description:
    "Transfer ownership of an Ownable contract. On Ownable2Step contracts this stages the pending owner, who must then accept.",
  args: [
    { name: "of", type: "command", description: "Keyword `of`" },
    {
      name: "contract",
      type: "address",
      description: "Ownable contract address",
    },
    { name: "to", type: "command", description: "Keyword `to`" },
    { name: "newOwner", type: "address", description: "New owner address" },
  ],
  completions: {
    of: () => [fieldItem("of")],
    to: () => [fieldItem("to")],
  },
  async run(_module, { of, contract, to, newOwner }) {
    if (of !== "of") {
      throw new ErrorException(`expected keyword "of", got "${of}"`);
    }
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }
    return [encodeAction(contract, "transferOwnership(address)", [newOwner])];
  },
});
