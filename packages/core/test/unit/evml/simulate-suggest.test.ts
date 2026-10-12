import { beforeEach, expect, it } from "bun:test";
import { defineCommand, defineModule, type Suggestion } from "@evmcrispr/sdk";
import { createEvml } from "../../../src/evml/tag";

const SUGGESTION: Suggestion = {
  line: "assert 1 == 1",
  description: "d",
  kind: "state",
  module: "t",
  event: "e",
  emitter: "0x00000000000000000000000000000000000a0001",
};

let seen: unknown;
let truncated = false;
beforeEach(() => {
  seen = undefined;
  truncated = false;
});
const fork = defineCommand({
  name: "fork",
  description: "stand-in",
  args: [{ name: "block", type: "block", description: "" }],
  async run(module, { block }, { interpreters }) {
    await interpreters.interpretNode(block as never, { simulation: true });
    seen = module.context.suggest && {
      tolerance: module.context.suggest.tolerance,
      executor: module.context.suggest.executor,
    };
    module.context.suggest?.report([SUGGESTION], { truncated });
    return [];
  },
});
class Sim extends defineModule("sim", {
  fork: { load: async () => ({ default: fork }) },
}) {}

const evml = createEvml();
evml.use(Sim);

it("passes the option to the fork and returns what it reports", async () => {
  const result = await evml
    .script("print hi")
    .simulate({ suggest: { tolerance: 5, executor: SUGGESTION.emitter } });
  expect(result.error).toBeUndefined();
  expect(seen).toEqual({ tolerance: 5, executor: SUGGESTION.emitter });
  expect(result.suggestions).toEqual([SUGGESTION]);
});

it("defaults the tolerance to 1 for suggest: true", async () => {
  await evml.script("print hi").simulate({ suggest: true });
  expect(seen).toEqual({ tolerance: 1, executor: undefined });
});

it("is off by default", async () => {
  const result = await evml.script("print hi").simulate();
  expect(seen).toBeUndefined();
  expect(result.suggestions).toBeUndefined();
});

it("returns none when the run fails", async () => {
  const result = await evml
    .script("nonsense-command")
    .simulate({ suggest: true });
  expect(result.success).toBe(false);
  expect(result.suggestions).toBeUndefined();
});

it("keeps the tolerance a percentage: finite, between 0 and 100", async () => {
  for (const [given, used] of [
    [Number.NaN, 1],
    [-1, 0],
    [250, 100],
    [5, 5],
  ]) {
    await evml.script("print hi").simulate({ suggest: { tolerance: given } });
    expect(seen).toEqual({ tolerance: used, executor: undefined });
  }
});

it("says when the suggestions were cut short", async () => {
  truncated = true;
  const cut = await evml.script("print hi").simulate({ suggest: true });
  expect(cut.suggestionsTruncated).toBe(true);
  truncated = false;
  const whole = await evml.script("print hi").simulate({ suggest: true });
  expect(whole.suggestionsTruncated).toBeUndefined();
});
