import "../../setup";
import {
  describeParity,
  installConstantMock,
} from "@evmcrispr/test-utils/onchain";
import { encodeAbiParameters, parseAbiParameters } from "viem";
import { helpers } from "../../../src/_generated";

const TEXT = "0x0000000000000000000000000000000000007a01";
const ARRAY = "0x0000000000000000000000000000000000007a02";
const TUPLE = "0x0000000000000000000000000000000000007a03";
const STATIC = "0x0000000000000000000000000000000000007a04";
const S = `${TEXT}::{value()(string)}`;
const A = `${ARRAY}::{value()(string[])}`;
const T = `${TUPLE}::{value()((uint256,string))}`;
const U = `${STATIC}::{value()((uint256,uint256))}`;
describeParity("dynamic ABI encoding", {
  helpers,
  setup: async (client) => {
    await installConstantMock(
      client,
      TEXT,
      encodeAbiParameters(parseAbiParameters("string"), ["hello"]),
    );
    await installConstantMock(
      client,
      ARRAY,
      encodeAbiParameters(parseAbiParameters("string[]"), [
        ["one", "", "three"],
      ]),
    );
    await installConstantMock(
      client,
      TUPLE,
      encodeAbiParameters(parseAbiParameters("(uint256,string)"), [
        [7n, "seven"],
      ]),
    );
    await installConstantMock(
      client,
      STATIC,
      encodeAbiParameters(parseAbiParameters("(uint256,uint256)"), [[7n, 9n]]),
    );
  },
  cases: [
    {
      name: "mixes dynamic strings and a static integer",
      run: `@abi.encode("string,uint256,string" ${S} 3 ${S})`,
      compile: `@abi.encode!("string,uint256,string" ${S} 3 ${S})`,
    },
    {
      name: "encodes array of strings before another dynamic value",
      run: `@abi.encode("string[],string" ${A} ${S})`,
      compile: `@abi.encode!("string[],string" ${A} ${S})`,
    },
    {
      name: "encodes dynamic tuples",
      run: `@abi.encode("(uint256,string),string" ${T} ${S})`,
      compile: `@abi.encode!("(uint256,string),string" ${T} ${S})`,
    },
    {
      name: "encodes static multiword tuples",
      run: `@abi.encode("(uint256,uint256),string" ${U} ${S})`,
      compile: `@abi.encode!("(uint256,uint256),string" ${U} ${S})`,
    },
  ],
});

import { expect, it } from "bun:test";
import { getPublicClient } from "@evmcrispr/test-utils";
import {
  compileExpression,
  installAssertionsCore,
  resolveValue,
  runExpression,
} from "@evmcrispr/test-utils/onchain";

it("rejects narrowing overflow rather than masking it in ABI encoders", async () => {
  const client = getPublicClient();
  await installAssertionsCore(client);
  const source = "0x0000000000000000000000000000000000007a05";
  await installConstantMock(
    client,
    source,
    encodeAbiParameters(parseAbiParameters("uint256"), [256n]),
  );
  const value = `${source}::{value()(uint256)}`;
  await expect(runExpression(`@abi.encode("uint8" ${value})`)).rejects.toThrow(
    "uint8",
  );
  const operand = await compileExpression(`@abi.encode!("uint8" ${value})`);
  await expect(
    resolveValue(client, operand.operand, { core: operand.ctx.core }),
  ).rejects.toThrow();
  const packed = await compileExpression(
    `@abi.encodePacked!("uint8" ${value})`,
  );
  await expect(
    resolveValue(client, packed.operand, { core: packed.ctx.core }),
  ).rejects.toThrow();
});

it("rejects noncanonical nested returndata during live ABI encoding", async () => {
  const client = getPublicClient();
  await installAssertionsCore(client);
  const source = "0x0000000000000000000000000000000000007a06";
  const canonical = encodeAbiParameters(parseAbiParameters("string[]"), [
    ["abc"],
  ]);
  // Dirty padding survives the raw fetch; strict on-chain assembly must reject it.
  await installConstantMock(
    client,
    source,
    `${canonical.slice(0, -2)}01` as `0x${string}`,
  );
  const expression = await compileExpression(
    `@abi.encode!("string[]" ${source}::{value()(string[])})`,
  );
  await expect(
    resolveValue(client, expression.operand, { core: expression.ctx.core }),
  ).rejects.toThrow();
});
