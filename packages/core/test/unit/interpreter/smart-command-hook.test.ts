import { expect, it } from "bun:test";
import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import {
  COMPOSABLE_EXECUTOR_ADDRESS,
  COMPOSABLE_STORAGE_ADDRESS,
  createSmartBatchState,
  getSmartCompileContext,
  type SmartBatchPlan,
} from "@evmcrispr/sdk/onchain";
import { createEvml, Interpreter, parseScript } from "../../../src";

const account = "0x1111111111111111111111111111111111111111";
it("passes raw AST to command compilation and captures the designated protocol call", async () => {
  const evm = new Interpreter(createEvml().registry, { account, chainId: 1 });
  const module = evm.getModule("std")!;
  const node = parseScript("custom $unresolved -> [$amount]").ast.body[0];
  const plan: SmartBatchPlan = {
    version: 1,
    salt: `0x${"11".repeat(32)}`,
    chainId: 1,
    account,
    route: "executor",
    executor: COMPOSABLE_EXECUTOR_ADDRESS,
    storage: COMPOSABLE_STORAGE_ADDRESS,
    steps: [],
    captures: [],
    dependencies: [],
  };
  const interpreters = {
    interpretNode: evm.interpretNode,
    interpretNodes: evm.interpretNodes,
  };
  const state = createSmartBatchState(plan, interpreters);
  const context = {
    ...interpreters,
    batchContext: {
      name: "batch!",
      smart: true,
      smartState: state,
      hasActions: false,
    },
  };
  let ran = false;
  const command = defineCommand({
    name: "custom",
    args: [{ name: "raw", type: "any" }],
    async compile(ctx, ast) {
      expect(ast).toBe(node);
      expect(ctx.batch).toBe(state);
      expect(
        getSmartCompileContext(module)?.interpreters.batchContext?.smartState,
      ).toBe(state);
      return {
        actions: [
          encodeAction(account, "approve(address,uint256)", [account, 1n]),
          encodeAction(account, "deposit() returns (uint256)", []),
        ],
        primaryCall: 1,
      };
    },
    async run() {
      ran = true;
      return [];
    },
  });
  await command.run(module, node, context);
  expect(ran).toBe(false);
  expect(getSmartCompileContext(module)).toBeUndefined();
  expect(plan.captures).toEqual([
    { name: "amount", type: { type: "uint256" }, step: 1, word: 0 },
  ]);
  const incompatible = defineCommand({
    name: "custom",
    args: [{ name: "raw", type: "any" }],
    batchable: () => "disabled mode",
    compile: command.compile,
    async run() {
      return [];
    },
  });
  await expect(
    incompatible.run(module, parseScript("custom 1").ast.body[0], context),
  ).rejects.toThrow("disabled mode");
});
