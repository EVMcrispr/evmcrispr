import "../../setup";
import { expect, test } from "bun:test";
import { encodeResolve, OPERATORS_ADDRESS } from "@evmcrispr/sdk/onchain";
import { getPublicClient } from "@evmcrispr/test-utils";
import {
  compileExpression,
  installAssertionsCore,
  installConstantMock,
} from "@evmcrispr/test-utils/onchain";
import { encodeAbiParameters } from "viem";

/** Includes calldata and intrinsic transaction gas, not just operator execution. */
test("measures composed collection word and generic paths", async () => {
  const client = getPublicClient();
  await installAssertionsCore(client);
  const source = "0x00000000000000000000000000000000000c0199";
  const preamble = `def @twice! "$x: number -> number" @calc!($x * 2)
 def @directTwice! "$x: int256 -> int256" ${OPERATORS_ADDRESS}::{mul(int256,int256)(int256) $x 2}
 def @directAdd! "$a: int256 $b: int256 -> int256" ${OPERATORS_ADDRESS}::{add(int256,int256)(int256) $a $b}
 def @directCmp! "$a: int256 $b: int256 -> int256" ${OPERATORS_ADDRESS}::{sub(int256,int256)(int256) $a $b}`;
  for (const count of [4, 16]) {
    await installConstantMock(
      client,
      source,
      encodeAbiParameters(
        [{ type: "int256[]" }],
        [Array.from({ length: count }, (_, i) => BigInt(i + 1))],
      ),
    );
    const arr = `${source}::{values()(int256[])}`;
    const rows = [
      ["sort words", `@sort!(${arr})`],
      ["sort generic", `@sort!(${arr} @directCmp!)`],
      ["map words", `@map!(${arr} @twice!)`],
      ["map generic", `@map!(${arr} @directTwice!)`],
      ["reduce words", `@reduce!(${arr} add 0)`],
      ["reduce generic", `@reduce!(${arr} @directAdd! 0)`],
    ];
    for (const [label, expression] of rows) {
      const { operand, ctx } = await compileExpression(expression, {
        module: "lang",
        preamble,
      });
      if (operand.kind !== "call")
        throw new Error("expected compiled collection");
      const gas = await client.estimateGas({
        to: ctx.core,
        data: encodeResolve(operand.param),
      });
      expect(gas > 0n).toBe(true);
      console.log(`collection-gas ${count} ${label}: ${gas}`);
    }
  }
}, 30_000);
