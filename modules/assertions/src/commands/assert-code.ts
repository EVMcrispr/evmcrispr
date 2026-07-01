import type { Action, Param } from "@evmcrispr/sdk";
import { defineCommand } from "@evmcrispr/sdk";
import type Assertions from "..";
import { encodeAssertion } from "../lib/assertions";

export default defineCommand<Assertions>({
  name: "assert-code",
  description: "Assert an address has deployed code, on-chain.",
  args: [
    { name: "target", type: "address", description: "Address to check" },
    {
      name: "message",
      type: "string",
      optional: true,
      description: "Revert message when the assertion fails",
    },
  ],
  async run(module, { target, message }): Promise<Action[]> {
    const params: Param[] = [target, message ?? ""];
    return [
      await encodeAssertion(module, "assertHasCode(address,string)", params),
    ];
  },
});
