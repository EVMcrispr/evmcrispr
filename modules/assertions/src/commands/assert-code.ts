import type { Action } from "@evmcrispr/sdk";
import { defineCommand } from "@evmcrispr/sdk";
import { keccak256 } from "viem";
import type Assertions from "..";
import {
  assertParamAction,
  resolveAssertionsContract,
  resolveOperatorsContract,
} from "../lib/assertions";
import { encodeOpRead } from "../lib/core";
import type { InputParam } from "../lib/erc8211";
import { constraint, rawParam, staticCallParam, toWord } from "../lib/erc8211";
import type { OpsAddresses } from "../lib/judge";
import { encodeOperator, opSelector } from "../lib/operators";

/** EXTCODEHASH of an existing account without code (EIP-1052). */
export const EMPTY_CODE_HASH = keccak256("0x");

/** `codehash != 0 && codehash != keccak256("")` composed over a plain
 *  `codehash(target)` read: 0 marks a nonexistent account, the empty-code
 *  hash an existing code-less one — code exists exactly when both differ.
 *  Each comparison is the core's `read` splicing the codehash value into
 *  an Operators call; the gate conjoins the 0/1 words with bitAnd/bitOr. */
export function hasCodeParam(
  addrs: OpsAddresses,
  target: `0x${string}`,
  wantCode: boolean,
): InputParam {
  const codehash = staticCallParam(
    addrs.operators,
    encodeOperator("codehash", [target]),
  );
  const cmp = wantCode ? "ne" : "eq";
  const gate = wantCode ? "bitAnd" : "bitOr";
  const nonZero = staticCallParam(
    addrs.core,
    encodeOpRead(addrs.operators, opSelector(cmp), [
      codehash,
      rawParam(toWord(0n)),
    ]),
  );
  const nonEmpty = staticCallParam(
    addrs.core,
    encodeOpRead(addrs.operators, opSelector(cmp), [
      codehash,
      rawParam(EMPTY_CODE_HASH),
    ]),
  );
  return staticCallParam(
    addrs.core,
    encodeOpRead(addrs.operators, opSelector(gate), [nonZero, nonEmpty]),
    [constraint("Eq", 1n)],
  );
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
    const addrs = {
      core: await resolveAssertionsContract(module),
      operators: await resolveOperatorsContract(module),
    };
    return [
      await assertParamAction(
        module,
        hasCodeParam(addrs, target, true),
        message ?? "",
      ),
    ];
  },
});
