import { describe, expect, it } from "bun:test";
import "../setup.js";

import { BindingsManager } from "@evmcrispr/sdk";
import { parseScript } from "../../src/parsers/script";
import {
  applySwitch,
  leaveSwitchScopes,
  type WalkChainState,
} from "../../src/scriptWalk";

/** The chain the editor walk is on at each command, in source order. */
function chains(script: string, state: WalkChainState) {
  const bindings = new BindingsManager();
  const commands = parseScript(script).ast.getAllCommandsUntilLine(
    Number.POSITIVE_INFINITY,
  );
  return commands.map((c) => {
    applySwitch(state, c, bindings);
    return [c.name, state.chainId];
  });
}

const fresh = (): WalkChainState => ({
  chainId: 1,
  client: undefined,
  offline: true,
});

describe("editor walk over scoped switches", () => {
  it("keeps a bare switch until the next one", () => {
    expect(chains("print 1\nswitch gnosis\nprint 2", fresh())).toEqual([
      ["print", 1],
      ["switch", 100],
      ["print", 100],
    ]);
  });

  it("leaves a block-form switch's chain after its block", () => {
    const state = fresh();
    expect(
      chains(
        `switch gnosis (
  print 1
  switch optimism (
    print 2
  )
  print 3
)
print 4`,
        state,
      ),
    ).toEqual([
      ["switch", 100],
      ["print", 100],
      ["switch", 10],
      ["print", 10],
      ["print", 100],
      ["print", 1],
    ]);
  });

  it("is on the fork's chain inside sim:fork --on, and back after it", () => {
    expect(
      chains(
        "load sim\nsim:fork --on gnosis (\n  print 1\n)\nprint 2",
        fresh(),
      ),
    ).toEqual([
      ["load", 1],
      ["fork", 100],
      ["print", 100],
      ["print", 1],
    ]);
  });

  it("moves on a bare switch inside a block until that block ends", () => {
    expect(
      chains(
        "if true (\n  print 0\n  switch gnosis\n  print 1\n)\nprint 2\nswitch optimism (\n  switch gnosis\n  print 3\n)\nprint 4",
        fresh(),
      ),
    ).toEqual([
      ["if", 1],
      ["print", 1],
      ["switch", 100],
      ["print", 100],
      ["print", 1],
      ["switch", 10],
      ["switch", 100],
      ["print", 100],
      ["print", 1],
    ]);
  });

  it("moves inside a loop body and a def body only, whatever chain follows", () => {
    expect(
      chains(
        'loop $i of [1 2] (\n  switch gnosis\n  print 1\n)\nprint 2\ndef there "" (\n  switch optimism\n  print 3\n)\nswitch polygon\nthere\nprint 4',
        fresh(),
      ),
    ).toEqual([
      ["loop", 1],
      ["switch", 100],
      ["print", 100],
      ["print", 1],
      ["def", 1],
      ["switch", 10],
      ["print", 10],
      ["switch", 137],
      ["there", 137],
      ["print", 137],
    ]);
  });

  it("unwinds several bare switches of one block to where the block started", () => {
    const state = fresh();
    chains(
      "if true (\n  switch gnosis\n  switch optimism\n  print 1\n)",
      state,
    );
    expect(state.chainId).toBe(10);
    leaveSwitchScopes(state, 6);
    expect(state.chainId).toBe(1);
  });

  it("can be told the walk ended past a block that closed the script", () => {
    const state = fresh();
    chains("switch gnosis (\n  print 1\n)", state);
    expect(state.chainId).toBe(100);
    // Line 2 is inside the block, line 4 is after it.
    leaveSwitchScopes(state, 2);
    expect(state.chainId).toBe(100);
    leaveSwitchScopes(state, 4);
    expect(state.chainId).toBe(1);
  });
});
