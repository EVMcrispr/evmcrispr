import "../setup";
import { beforeAll, describe, it } from "bun:test";
import {
  BindingsSpace,
  type CommandExpressionNode,
  type Node,
  NodeType,
} from "@evmcrispr/sdk";
import type { CompileCtx, Operand } from "@evmcrispr/sdk/onchain";
import {
  compileOperand,
  compileTopCall,
  encodeResolve,
} from "@evmcrispr/sdk/onchain";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import { createInterpreter } from "@evmcrispr/test-utils/evml";
import { installAssertionsCore } from "@evmcrispr/test-utils/onchain";
import { decodeAbiParameters, type Hex } from "viem";

/**
 * The first execution of compiled calldata against the real contracts.
 *
 * Every other on-chain suite asserts calldata SHAPE: it interprets a script,
 * decodes the emitted `assertParam` bytes and compares them to a hand-written
 * expectation. That proves the compiler emits what we think it should, not
 * that the core resolves it to the right answer.
 *
 * Here the two contracts are installed on the fork and `Assertions.resolve`
 * is called, which resolves an operand and raw-returns the resolved bytes.
 * The value that comes back is compared against what the same expression
 * produces off-chain.
 */

/** Aave v3 pool on Gnosis — `getReservesList()` returns a real `address[]`,
 *  which exercises the words-payload path where an array loses its ABI head. */
const AAVE_POOL = "0xb50201558B00496A145fE76f7424749556E326D8";
const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";

const PREAMBLE = "load assertions\nload lang";

/** Compile one expression to its raw, PRE-JUDGE operand.
 *
 * Deliberately not routed through `assertions:assert`: the judge folds a
 * String/Bytes side into `hash(x) EQ digest`, after which the value cannot be
 * recovered. This mirrors assert.ts's own side dispatch and stops before it.
 */
async function compileExpression(expression: string): Promise<Operand> {
  const client = getPublicClient();
  const script = `${PREAMBLE}\nset $res ${expression}`;
  const i = createInterpreter(script, client);

  // Interpret only the preamble, so `load` binds the modules without the
  // expression being evaluated off-chain.
  const preambleOnly = createInterpreter(PREAMBLE, client);
  await preambleOnly.interpret();

  const setCommand = i.ast.body
    .filter((n: Node) => (n as CommandExpressionNode).name === "set")
    .at(-1) as CommandExpressionNode;
  const node = setCommand.args[1]!;

  const ctx: CompileCtx = {
    module: preambleOnly.getModule("assertions")!,
    interpreters: {
      interpretNode: preambleOnly.evm.interpretNode,
      interpretNodes: preambleOnly.evm.interpretNodes,
    },
    core: CORE,
    operators: OPERATORS,
  };

  return node.type === NodeType.CallExpression
    ? compileTopCall(ctx, node as never)
    : compileOperand(ctx, node);
}

/** Evaluate an expression off-chain and hand back the raw binding. */
async function runOffchain(expression: string): Promise<unknown> {
  const i = createInterpreter(
    `${PREAMBLE}\nset $res ${expression}`,
    getPublicClient(),
  );
  await i.interpret();
  return i.getBinding("$res", BindingsSpace.USER);
}

/** Resolve an operand on-chain and return the raw returndata. */
async function resolveRaw(operand: Operand): Promise<Hex> {
  if (operand.kind !== "call") {
    throw new Error(`expected a live operand, got a ${operand.kind}`);
  }
  // `resolve` validates constraints before returning, so a judged param would
  // revert instead of yielding its value. Only the OUTER constraints are
  // dropped; nested ones are part of the expression's meaning.
  const { data } = await getPublicClient().call({
    to: CORE,
    data: encodeResolve({ ...operand.param, constraints: [] }),
  });
  return (data ?? "0x") as Hex;
}

let CORE: `0x${string}`;
let OPERATORS: `0x${string}`;

describe("assertions > resolve (execution spike)", () => {
  beforeAll(async () => {
    ({ core: CORE, operators: OPERATORS } = await installAssertionsCore(
      getPublicClient(),
    ));
  });

  it("resolves a uint256 read to the same value the run face returns", async () => {
    const call = `${WXDAI}::{totalSupply()(uint256)}`;
    const raw = await resolveRaw(await compileExpression(call));
    const onchain = BigInt(raw.slice(0, 66) as Hex);
    const offchain = await runOffchain(call);
    expect(onchain.toString()).to.equal(String(offchain));
    expect(onchain > 0n).to.be.true;
  }, 30_000);

  it("resolves a string read, which travels with its own ABI envelope", async () => {
    const call = `${WXDAI}::{symbol()(string)}`;
    const raw = await resolveRaw(await compileExpression(call));
    const [onchain] = decodeAbiParameters([{ type: "string" }], raw) as [
      string,
    ];
    expect(onchain).to.equal(String(await runOffchain(call)));
    expect(onchain).to.equal("WXDAI");
  }, 30_000);

  it("resolves an array length through the words-payload path", async () => {
    const call = `${AAVE_POOL}::{getReservesList()(address[])}`;
    const raw = await resolveRaw(
      await compileExpression(`@lang:len!(${call})`),
    );
    const onchain = BigInt(raw.slice(0, 66) as Hex);
    const offchain = await runOffchain(`@lang:len(${call})`);
    expect(onchain.toString()).to.equal(String(offchain));
    expect(onchain > 0n).to.be.true;
  }, 30_000);

  it("resolves a sorted array to the same elements the run face returns", async () => {
    const call = `${AAVE_POOL}::{getReservesList()(address[])}`;
    const raw = await resolveRaw(
      await compileExpression(`@lang:sort!(${call})`),
    );
    const [payload] = decodeAbiParameters([{ type: "bytes" }], raw) as [Hex];

    const words: bigint[] = [];
    for (let i = 2; i < payload.length; i += 64) {
      words.push(BigInt(`0x${payload.slice(i, i + 64)}`));
    }
    expect(words.length).to.be.greaterThan(0);
    // sortWords is an unsigned word sort: the result must be ascending.
    for (let i = 1; i < words.length; i++) {
      expect(words[i]! >= words[i - 1]!).to.be.true;
    }
  }, 30_000);
});
