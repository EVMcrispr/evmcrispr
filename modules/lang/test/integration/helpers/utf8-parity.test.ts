import "../../setup";
import {
  describeParity,
  installConstantMock,
} from "@evmcrispr/test-utils/onchain";
import { encodeAbiParameters } from "viem";
import { helpers } from "../../../src/_generated";

const SOURCE = "0x0000000000000000000000000000000000ba9878";
const TEXT = `${SOURCE}::{value()(string)}`;
describeParity("UTF-8 string semantics", {
  module: "lang [@str.len @str.upper @str.lower @str.slice @str.at]",
  helpers,
  setup: async (client) => {
    await installConstantMock(
      client,
      SOURCE,
      encodeAbiParameters([{ type: "string" }], ["aéßZ"]),
    );
  },
  cases: [
    {
      name: "length measures bytes",
      run: `@str.len(${TEXT})`,
      compile: `@str.len!(${TEXT})`,
    },
    {
      name: "upper preserves non-ASCII letters",
      run: `@str.upper(${TEXT})`,
      compile: `@str.upper!(${TEXT})`,
    },
    {
      name: "lower preserves non-ASCII letters",
      run: `@str.lower(${TEXT})`,
      compile: `@str.lower!(${TEXT})`,
    },
    {
      name: "slice uses byte offsets",
      run: `@str.slice(${TEXT} 1 3)`,
      compile: `@str.slice!(${TEXT} 1 3)`,
    },
    {
      name: "slice clamps extreme bounds",
      run: `@str.slice(${TEXT} -999 999)`,
      compile: `@str.slice!(${TEXT} -999 999)`,
    },
    {
      name: "slice with reversed bounds is empty",
      run: `@str.slice(${TEXT} 5 1)`,
      compile: `@str.slice!(${TEXT} 5 1)`,
    },
    {
      name: "at uses negative byte offsets",
      run: `@str.at(${TEXT} -1)`,
      compile: `@str.at!(${TEXT} -1)`,
    },
  ],
});

import { expect, test } from "bun:test";
import { encodeResolve } from "@evmcrispr/sdk/onchain";
import { getPublicClient } from "@evmcrispr/test-utils";
import {
  compileExpression,
  installAssertionsCore,
  runExpression,
} from "@evmcrispr/test-utils/onchain";

test("both faces reject slicing through a UTF-8 character", async () => {
  const client = getPublicClient();
  await installAssertionsCore(client);
  await installConstantMock(
    client,
    SOURCE,
    encodeAbiParameters([{ type: "string" }], ["é"]),
  );
  for (const [plain, live] of [
    [`@str.slice(${TEXT} 0 1)`, `@str.slice!(${TEXT} 0 1)`],
    [`@str.at(${TEXT} 0)`, `@str.at!(${TEXT} 0)`],
  ]) {
    await expect(
      runExpression(plain, { module: "lang [@str.at @str.slice]" }),
    ).rejects.toThrow("UTF-8");
    const { operand, ctx } = await compileExpression(live, { module: "lang" });
    if (operand.kind !== "call") throw new Error("Expected runtime operand");
    await expect(
      client.call({ to: ctx.core, data: encodeResolve(operand.param) }),
    ).rejects.toThrow();
  }
});
