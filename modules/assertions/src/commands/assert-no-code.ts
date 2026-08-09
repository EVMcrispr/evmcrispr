import type { Action } from "@evmcrispr/sdk";
import { defineCommand } from "@evmcrispr/sdk";
import type Assertions from "..";
import {
  assertParamAction,
  resolveAssertionsContract,
  resolveOperatorsContract,
} from "../lib/assertions";
import { hasCodeParam } from "./assert-code";

export default defineCommand<Assertions>({
  name: "assert-no-code",
  description: "Assert an address has no deployed code, on-chain.",
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
    const addrs = {
      core: await resolveAssertionsContract(module),
      operators: await resolveOperatorsContract(module),
    };
    return [
      await assertParamAction(
        module,
        hasCodeParam(addrs, target, false),
        message ?? "",
      ),
    ];
  },
});
