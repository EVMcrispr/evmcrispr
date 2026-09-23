/** Exercise declared runtime fields using each command's existing successful fixture. */

import { parseScript } from "@evmcrispr/core";
import {
  BindingsSpace,
  defineHelper,
  type Node,
  NodeType,
  Num,
  resolveCommand,
} from "@evmcrispr/sdk";
import {
  CORE_ADDRESS,
  compileCallValue,
  compileOperand,
  compileSmartBatch,
  encodeResolve,
  rawParam,
  runtimeValue,
  staticCallParam,
} from "@evmcrispr/sdk/onchain";
import { expect } from "chai";
import type { AbiParameter, PublicClient } from "viem";
import { encodeAbiParameters, isAddress } from "viem";
import { createInterpreter } from "../evml";
import type { CommandTestConfig } from "./describeCommand";

function live(value: any, type: unknown, salt: `0x${string}`): any {
  if (Array.isArray(value)) return value.map((v) => live(v, "any", salt));
  let abi: AbiParameter;
  if (
    value instanceof Num ||
    typeof value === "bigint" ||
    typeof value === "number"
  ) {
    value = Num(value).toBigInt();
    abi = { type: value < 0n ? "int256" : "uint256" };
  } else if (typeof value === "boolean" || type === "bool") {
    abi = { type: "bool" };
    value = value === true || value === "true";
  } else if (typeof value === "string") {
    abi = {
      type:
        type === "address" || isAddress(value)
          ? "address"
          : type === "bytes32"
            ? "bytes32"
            : type === "bytes" || /^0x[0-9a-f]*$/i.test(value)
              ? "bytes"
              : "string",
    };
  } else if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, live(v, "any", salt)]),
    );
  } else throw new Error("runtime fixture needs a serializable ABI value");
  const encoded = encodeAbiParameters([abi], [value]);
  return runtimeValue(
    staticCallParam(CORE_ADDRESS, encodeResolve(rawParam(encoded))),
    abi,
    salt,
  );
}

export async function checkSmartCommandFields(
  commandName: string,
  config: CommandTestConfig,
  client: PublicClient,
  factory = createInterpreter,
): Promise<void> {
  const find = (nodes: any[]): any => {
    for (const n of nodes) {
      if (n.name === commandName) return n;
      for (const a of n.args ?? [])
        if (a.type === NodeType.BlockExpression) {
          const found = find(a.body);
          if (found) return found;
        }
    }
  };
  const candidates = [...(config.smartCases ?? config.cases ?? [])];
  if (commandName === "create-pool" || commandName === "auto-wrap")
    candidates.sort(
      (a, b) =>
        Number(/--(?:admin|allowance)\b/.test(b.script)) -
        Number(/--(?:admin|allowance)\b/.test(a.script)),
    );
  // Runtime swaps need explicit bounds; the ordinary quote fixture remains covered separately.
  if (config.module === "swaps")
    candidates.sort(
      (a, b) =>
        Number(/--(?:min|max)\b/.test(b.script)) -
        Number(/--(?:min|max)\b/.test(a.script)),
    );
  const c = candidates.find(
    (c) =>
      !/sim:fork/.test(c.script) &&
      find(parseScript(`${config.preamble ?? ""}\n${c.script}`).ast.body),
  );
  if (!c)
    throw new Error(
      `Add a smart fixture for ${config.module ?? "std"}:${commandName}`,
    );
  const nodes = parseScript(`${config.preamble ?? ""}\n${c.script}`).ast.body;
  const position = nodes.findIndex((n) => !!find([n]));
  const original = find([nodes[position]]);
  const salt = `0x${"b1".repeat(32)}` as const;
  const initialize = async () => {
    if (c.setup) await c.setup(client);
    const test = factory("", client, { chainId: config.chainId });
    await test.interpret();
    await test.evm.interpretNodes(nodes.slice(0, position), true);
    const mod = test.evm.getModule(
      original.module ?? config.module?.split(/[\s[]/)[0] ?? "std",
    )!;
    return {
      test,
      mod,
      command: await resolveCommand(mod.commands[commandName]),
    };
  };
  const { command } = await initialize();
  const fields: {
    name: string;
    type: unknown;
    nodes: Node[];
    set: (c: typeof original, nodes: Node[]) => void;
  }[] = [];
  command.argDefs.forEach((def, i) => {
    if (!def.runtime || !original.args[i]) return;
    const args = def.rest ? original.args.slice(i) : [original.args[i]];
    fields.push({
      name: def.name,
      type: def.type,
      nodes: args,
      set: (c, nodes) => c.args.splice(i, args.length, ...nodes),
    });
  });
  command.optDefs.forEach((def) => {
    const i = original.opts.findIndex(
      (o: { name: string }) => o.name === def.name,
    );
    if (!def.runtime || i < 0) return;
    fields.push({
      name: `--${def.name}`,
      type: def.type,
      nodes: [original.opts[i].value],
      set: (c, nodes) => {
        c.opts[i].value = nodes[0] as (typeof c.opts)[number]["value"];
      },
    });
  });
  expect(
    fields.length,
    `No runtime field in ${commandName}'s fixture`,
  ).to.be.greaterThan(0);
  for (const field of fields) {
    const { test, mod } = await initialize();
    const body = structuredClone([nodes[position]]);
    const node = find(body);
    const replacements: Node[] = [];
    for (let i = 0; i < field.nodes.length; i++) {
      if (
        field.type === "expression" ||
        field.nodes[i].type === NodeType.HelperFunctionExpression
      ) {
        // An on-chain `!` fixture compiles, keeping what only its compile
        // face knows (e.g. @abi.encodeCall!'s fixed selector).
        const compiles =
          field.type === "expression" ||
          (field.nodes[i] as { name?: string }).name?.endsWith("!");
        const std = test.evm.getModule("std")!;
        std.helpers["smart-fixture!"] = defineHelper({
          name: "smart-fixture",
          args: [{ name: "value", type: "expression" }],
          returnType: "any",
          async compile(ctx, node) {
            if (compiles) {
              if (node.args[0].type === NodeType.CallExpression) {
                const { param, terminal } = await compileCallValue(
                  ctx,
                  node.args[0],
                );
                return runtimeValue(param, terminal, salt).operand;
              }
              const operand = await compileOperand(ctx, node.args[0]);
              return operand.kind === "call"
                ? operand
                : live(operand.value, "any", salt).operand;
            }
            const value = live(
              await ctx.interpreters.interpretNode(node.args[0]),
              field.type,
              salt,
            );
            if (!value.operand)
              throw new Error(
                "Use a literal array fixture to preserve build-time shape",
              );
            return value.operand;
          },
          async run() {
            throw new Error("fixture must compile");
          },
        });
        replacements.push({
          type: NodeType.HelperFunctionExpression,
          name: "smart-fixture!",
          args: [field.nodes[i]],
        } as Node);
        continue;
      }
      const value = await test.evm.interpretNode(field.nodes[i]);
      const name = `$smart_fixture_${i}`;
      test.bindingsManager.setBinding(
        name,
        live(value, field.type, salt),
        BindingsSpace.USER,
      );
      replacements.push({ type: NodeType.VariableIdentifier, value: name });
    }
    field.set(node, replacements);
    const plan = await compileSmartBatch(
      mod,
      { type: NodeType.BlockExpression, body },
      {
        interpretNode: test.evm.interpretNode,
        interpretNodes: test.evm.interpretNodes,
      },
      {
        account: await mod.getSender(),
        name: "smart field fixture",
        route: "executor",
        salt,
      },
    );
    expect(plan.steps.length, `${commandName} ${field.name}`).to.be.greaterThan(
      0,
    );
    expect(structuredClone(plan)).to.deep.equal(plan);
  }
}
