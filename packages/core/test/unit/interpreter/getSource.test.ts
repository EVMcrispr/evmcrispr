import { describe, expect, it } from "bun:test";
import "../../setup.js";

import type { BlockExpressionNode, DefValue } from "@evmcrispr/sdk";
import {
  BindingsSpace,
  defineCommand,
  defineModule,
  sliceNodeText,
} from "@evmcrispr/sdk";
import { createEvml } from "../../../src/evml/tag";
import { Interpreter } from "../../../src/interpreter/Interpreter";

const seen: string[] = [];
const grab = defineCommand({
  name: "grab",
  description: "records its block's source",
  args: [{ name: "block", type: "block", description: "block" }],
  async run(module, { block }) {
    seen.push(
      sliceNodeText(
        module.context.getSource()!.split("\n"),
        block as BlockExpressionNode,
      )!,
    );
    return [];
  },
});
const Stub = defineModule("stub", {
  grab: { load: async () => ({ default: grab }), description: "grab" },
});

describe("ModuleContext.getSource", () => {
  const evml = createEvml({
    account: "0x000000000000000000000000000000000000dEaD",
  });
  evml.use(Stub);

  it("returns a block's verbatim source, including nested blocks and comments", async () => {
    seen.length = 0;
    const script = `load stub
stub:grab (
  # a comment
  if true (
    set $x 1
  )
)`;
    await evml.script(script).interpret();
    expect(seen).toEqual([
      "(\n  # a comment\n  if true (\n    set $x 1\n  )\n)",
    ]);
  });

  it("uses absolute positions when the block is nested inside another block", async () => {
    seen.length = 0;
    await evml
      .script(`load stub\nif true (\n  stub:grab (\n    set $y 2\n  )\n)`)
      .interpret();
    expect(seen).toEqual(["(\n    set $y 2\n  )"]);
  });

  it("keeps the original def command node on the def binding", async () => {
    const script = `def double "$n: number -> number" (\n  set $r $n\n)`;
    const interpreter = new Interpreter(evml.registry, evml.config);
    await interpreter.interpret(script);
    const def = interpreter.getBinding("double", BindingsSpace.DEF) as DefValue;
    expect(def.node.name).toBe("def");
    expect(def.node.loc?.start.line).toBe(1);
    expect(def.node.loc?.end.line).toBe(3);
  });
});
