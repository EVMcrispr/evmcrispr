import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import type Vault from "..";
import { requireOperatorSupport } from "../erc7540";
import { rejectNative } from "../utils/amounts";

export default defineCommand<Vault>({
  name: "set-operator",
  description:
    "Approve (default) or revoke an operator on an ERC-7540 vault. Operators can request and claim on behalf of the connected account.",
  args: [
    {
      name: "operator",
      type: "address",
      description: "Operator account to approve or revoke",
    },
    { name: "on", type: "command", description: "Keyword `on`" },
    {
      name: "vault",
      type: "address",
      description: "ERC-7540 vault address",
    },
    {
      name: "approved",
      type: "bool",
      optional: true,
      description: "Pass `false` to revoke the operator (defaults to `true`)",
    },
  ],
  completions: {
    on: () => [fieldItem("on")],
    approved: () => [fieldItem("false")],
  },
  async run(module, { operator, on, vault, approved = true }) {
    if (on !== "on") {
      throw new ErrorException(`expected keyword "on", got "${on}"`);
    }
    rejectNative(vault);
    await requireOperatorSupport(module, vault);
    return [
      encodeAction(vault, "setOperator(address,bool)", [operator, approved]),
    ];
  },
});
