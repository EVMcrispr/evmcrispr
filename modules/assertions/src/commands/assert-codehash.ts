import type { Action, Param } from "@evmcrispr/sdk";
import { defineCommand } from "@evmcrispr/sdk";
import type Assertions from "..";
import { encodeAssertion } from "../lib/assertions";

export default defineCommand<Assertions>({
  name: "assert-codehash",
  description: "Assert an address has a specific code hash, on-chain.",
  args: [
    { name: "target", type: "address", description: "Address to check" },
    {
      name: "expected",
      type: "bytes32",
      description: "Expected code hash (keccak256 of the runtime bytecode)",
    },
    {
      name: "message",
      type: "string",
      optional: true,
      description: "Revert message when the assertion fails",
    },
  ],
  async run(module, { target, expected, message }): Promise<Action[]> {
    const params: Param[] = [target, expected, message ?? ""];
    return [
      await encodeAssertion(
        module,
        "assertEqCodeHash(address,bytes32,string)",
        params,
      ),
    ];
  },
});
