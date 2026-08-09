import type { Action } from "@evmcrispr/sdk";
import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import { isHex } from "viem";
import type Assertions from "..";
import { assertParamAction, resolveOperatorsContract } from "../lib/assertions";
import { constraint, staticCallParam } from "../lib/erc8211";
import { encodeOperator } from "../lib/operators";

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
    if (!isHex(expected) || expected.length !== 66) {
      throw new ErrorException(
        "the expected code hash must be a 32-byte hex value",
      );
    }
    const operators = await resolveOperatorsContract(module);
    const param = staticCallParam(
      operators,
      encodeOperator("codehash", [target]),
      [constraint("Eq", expected)],
    );
    return [await assertParamAction(module, param, message ?? "")];
  },
});
