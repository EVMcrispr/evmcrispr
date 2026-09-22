import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import type Governor from "..";

export default defineCommand<Governor>({
  smartSupport: { kind: "runtime" },
  name: "delegate",
  description:
    "Delegate the voting power the connected account holds in an ERC20Votes/ERC721Votes token.",
  args: [
    {
      name: "token",
      type: "address",
      runtime: true,
      description: "Votes token address",
    },
    { name: "to", type: "command", description: "Keyword `to`" },
    {
      name: "delegatee",
      type: "address",
      runtime: true,
      description: "Account receiving the voting power",
    },
  ],
  completions: { to: () => [fieldItem("to")] },
  async run(_module, { token, to, delegatee }) {
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }
    return [encodeAction(token, "delegate(address)", [delegatee])];
  },
});
