import type { Action } from "@evmcrispr/sdk";
import { defineCommand } from "@evmcrispr/sdk";
import { keccak256 } from "viem";
import type Assertions from "..";
import {
  assertParamAction,
  resolveCombinatorsContract,
} from "../lib/assertions";
import { encodeCalc, encodeEnv } from "../lib/combinators";
import type { InputParam } from "../lib/erc8211";
import { constraint, rawParam, staticCallParam, toWord } from "../lib/erc8211";

/** EXTCODEHASH of an existing account without code (EIP-1052). */
export const EMPTY_CODE_HASH = keccak256("0x");

/** `codehash != 0 && codehash != keccak256("")` composed over
 *  env(CodeHash): 0 marks a nonexistent account, the empty-code hash an
 *  existing code-less one — code exists exactly when both differ. */
export function hasCodeParam(
  combinators: `0x${string}`,
  target: `0x${string}`,
  wantCode: boolean,
): InputParam {
  const codehash = staticCallParam(
    combinators,
    encodeEnv("CodeHash", BigInt(target)),
  );
  const cmp = wantCode ? ("Ne" as const) : ("Eq" as const);
  const gate = wantCode ? ("And" as const) : ("Or" as const);
  const nonZero = staticCallParam(
    combinators,
    encodeCalc(cmp, codehash, rawParam(toWord(0n))),
  );
  const nonEmpty = staticCallParam(
    combinators,
    encodeCalc(cmp, codehash, rawParam(EMPTY_CODE_HASH)),
  );
  return staticCallParam(combinators, encodeCalc(gate, nonZero, nonEmpty), [
    constraint("Eq", 1n),
  ]);
}

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
    const combinators = await resolveCombinatorsContract(module);
    return [
      await assertParamAction(
        module,
        hasCodeParam(combinators, target, true),
        message ?? "",
      ),
    ];
  },
});
