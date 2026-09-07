import "../setup";
import {
  CORE_ABI,
  CORE_ADDRESS,
  EXPRESSIONS_ABI,
  EXPRESSIONS_ADDRESS,
  OPERATIONS_ADDRESS,
} from "@evmcrispr/sdk/onchain";
import { expect } from "@evmcrispr/test-utils";
import {
  createAssertDecoders,
  type DecodedParam,
  describeCommand,
  selectorOf,
  word,
} from "@evmcrispr/test-utils/evml";
import {
  decodeAbiParameters,
  decodeFunctionData,
  getAddress,
  keccak256,
} from "viem";

const ASSERTIONS = getAddress(CORE_ADDRESS);
const OPERATIONS = getAddress(OPERATIONS_ADDRESS);
const SAFE = getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const OWNER = getAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045");
// keccak256("guard_manager.guard.address")
const GUARD_SLOT =
  "0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8";

const preamble = `load safe`;

const d = createAssertDecoders({
  assertions: ASSERTIONS,
  operators: OPERATIONS,
});

describeCommand("assert (safe on-chain faces)", {
  describeName: "Safe > helpers > on-chain faces",
  preamble,
  cases: [
    {
      name: "compiles @threshold! to a direct getThreshold() staticcall",
      script: `assert @safe:threshold!(${SAFE}) >= 3 "threshold lowered"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(SAFE);
        expect(call.data).to.equal(selectorOf("getThreshold()"));
        d.expectConstraint(param, "Gte", 3n);
      },
    },
    {
      name: "compiles @nonce! to a direct nonce() staticcall",
      script: `assert @safe:nonce!(${SAFE}) == 42 "nonce moved"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(SAFE);
        expect(call.data).to.equal(selectorOf("nonce()"));
        d.expectConstraint(param, "Eq", 42n);
      },
    },
    {
      name: "compiles @isOwner! to the Safe's own isOwner(address) view",
      script: `assert @safe:isOwner!(${OWNER} ${SAFE})`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(SAFE);
        expect(call.data).to.equal(
          `${selectorOf("isOwner(address)")}${word(BigInt(OWNER)).slice(2)}`,
        );
        d.expectConstraint(param, "Eq", 1n);
      },
    },
    {
      name: "reads the @guard! slot through getStorageAt with pick word 2",
      script: `assert @safe:guard!(${SAFE}) == 0x0000000000000000000000000000000000000000 "guard installed"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const pick = d.core(param);
        expect(pick.functionName).to.equal("pick");
        expect(pick.args[1]).to.equal(2n);
        const call = d.staticCallOf(pick.args[0] as unknown as DecodedParam);
        expect(call.target).to.equal(SAFE);
        expect(call.data).to.equal(
          `${selectorOf("getStorageAt(uint256,uint256)")}${GUARD_SLOT.slice(2)}${word(1n).slice(2)}`,
        );
        d.expectConstraint(param, "Eq", 0n);
      },
    },
  ],
});

// ---------------------------------------------------------------------------
//  Array faces: @owners! and @modules! resolve live word payloads that
//  compose with the lang array faces.
// ---------------------------------------------------------------------------

const arrayPreamble = `${preamble}\nload lang`;

const SENTINEL_START = 1n;

/** Validate the array word-payload extraction (slice(data, 64, 32n) over
 *  the re-framed envelope, count via a LEN-path nav) and return the
 *  spliced source envelope param. */
function expectWordsPayload(param: DecodedParam): DecodedParam {
  const call = d.staticCallOf(param);
  expect(call.target).to.equal(getAddress(EXPRESSIONS_ADDRESS));
  const decoded = decodeFunctionData({
    abi: EXPRESSIONS_ABI,
    data: call.data,
  });
  expect(decoded.functionName).to.equal("evaluate");
  if (decoded.functionName !== "evaluate") throw new Error("expected graph");
  const [expression] = decoded.args;
  const sources = expression.nodes.filter((n) => n.kind === 2);
  expect(sources).to.have.lengthOf(1);
  expect(sources[0].valueType).to.equal("address[]");
  expect(expression.nodes[Number(expression.result)].selector).to.equal(
    selectorOf("sliceRange(bytes,int256,int256)"),
  );
  return decodeAbiParameters(
    CORE_ABI.find((f) => f.name === "resolve")!.inputs,
    sources[0].data,
  )[0] as DecodedParam;
}

describeCommand("assert (safe array faces)", {
  describeName: "Safe > helpers > on-chain array faces",
  preamble: arrayPreamble,
  cases: [
    {
      name: "compiles @owners! to the live getOwners() words payload",
      script: `assert @safe:owners!(${SAFE}) == 0x1122`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const envelope = expectWordsPayload(hashArgs[0]);
        const call = d.staticCallOf(envelope);
        expect(call.target).to.equal(SAFE);
        expect(call.data).to.equal(selectorOf("getOwners()"));
        d.expectConstraint(param, "Eq", BigInt(keccak256("0x1122")));
      },
    },
    {
      name: "composes @owners! with @includes! as a nested array face",
      script: `assert @includes!(@safe:owners!(${SAFE}) ${OWNER})`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        d.expectConstraint(param, "Eq", 1n);
        const args = d.opReadOf(
          param,
          "foldWords(bytes,address,bytes,uint256,uint256[],bytes32,uint8)",
        );
        expect(args).to.have.lengthOf(2);
        const envelope = expectWordsPayload(args[1]);
        expect(d.staticCallOf(envelope).target).to.equal(SAFE);
      },
    },
    {
      name: "composes @owners! with @len! as the live owner count",
      script: `assert @len!(@safe:owners!(${SAFE})) >= 3`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const divArgs = d.opReadOf(param, "div(uint256,uint256)");
        const byteLenArgs = d.opReadOf(divArgs[0], "byteLen(bytes)");
        const envelope = expectWordsPayload(byteLenArgs[0]);
        expect(d.staticCallOf(envelope).target).to.equal(SAFE);
        d.expectRawWord(divArgs[1], 32n);
        d.expectConstraint(param, "Gte", 3n);
      },
    },
    {
      name: "composes @owners! with @at! as typed array navigation",
      script: `assert @at!(@safe:owners!(${SAFE}) 0) != 0x0000000000000000000000000000000000000000`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const { a, b } = d.expectOpJudge(param, "ne(uint256,uint256)");
        d.expectRawWord(b, 0n);
        const nav = d.core(a);
        expect(nav.functionName).to.equal("nav");
        expect(nav.args[1]).to.equal("(address[])");
        expect(nav.args[2]).to.deep.equal([0n, 0n]);
      },
    },
    {
      name: "compiles @modules! to one getModulesPaginated page navigated to its array",
      script: `assert @safe:modules!(${SAFE}) == 0x1122`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const envelope = expectWordsPayload(hashArgs[0]);
        // The envelope is nav([0]) into the (address[], address) return.
        const nav = d.core(envelope);
        expect(nav.functionName).to.equal("nav");
        expect(nav.args[1]).to.equal("(address[],address)");
        expect(nav.args[2]).to.deep.equal([0n]);
        const call = d.staticCallOf(nav.args[0] as unknown as DecodedParam);
        expect(call.target).to.equal(SAFE);
        // getModulesPaginated(0x1, 100): the sentinel starts the module
        // list; the default page size caps the read at 100 modules.
        expect(call.data).to.equal(
          `${selectorOf("getModulesPaginated(address,uint256)")}${word(SENTINEL_START).slice(2)}${word(100n).slice(2)}`,
        );
      },
    },
    {
      name: "bakes a custom @modules! pageSize at composition time",
      script: `assert @len!(@safe:modules!(${SAFE} 500)) == 12`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const divArgs = d.opReadOf(param, "div(uint256,uint256)");
        const byteLenArgs = d.opReadOf(divArgs[0], "byteLen(bytes)");
        const envelope = expectWordsPayload(byteLenArgs[0]);
        const nav = d.core(envelope);
        const call = d.staticCallOf(nav.args[0] as unknown as DecodedParam);
        expect(call.data).to.equal(
          `${selectorOf("getModulesPaginated(address,uint256)")}${word(SENTINEL_START).slice(2)}${word(500n).slice(2)}`,
        );
        d.expectConstraint(param, "Eq", 12n);
      },
    },
  ],
  errorCases: [
    {
      name: "rejects a non-positive @modules! pageSize",
      script: `assert @len!(@safe:modules!(${SAFE} 0)) == 0`,
      error: "pageSize must be positive",
    },
  ],
});

// The metadata is consumed by nested helpers at runtime, not only by the compiler.
import { test } from "bun:test";
import { encodeResolve } from "@evmcrispr/sdk/onchain";
import { getPublicClient } from "@evmcrispr/test-utils";
import {
  compileExpression,
  installAssertionsCore,
  installConstantMock,
} from "@evmcrispr/test-utils/onchain";
import { encodeAbiParameters, type Hex } from "viem";

test("Safe owners remain typed through nested collection consumers", async () => {
  const client = getPublicClient();
  const source = "0x00000000000000000000000000000000000d0300";
  await installAssertionsCore(client);
  await installConstantMock(
    client,
    source,
    encodeAbiParameters([{ type: "address[]" }], [[OWNER]]),
  );
  for (const [expression, type, want] of [
    [`@includes!(@safe:owners!(${source}) ${OWNER})`, "bool", true],
    [`@at!(@safe:owners!(${source}) 0)`, "address", OWNER],
    [`@len!(@safe:owners!(${source}))`, "uint256", 1n],
  ] as const) {
    const { operand, ctx } = await compileExpression(expression, {
      module: "lang",
      preamble: "load safe",
    });
    if (operand.kind !== "call") throw new Error("expected call");
    const { data } = await client.call({
      to: ctx.core,
      data: encodeResolve(operand.param),
    });
    expect(decodeAbiParameters([{ type }], data as Hex)[0]).to.equal(want);
  }
});
