import "../setup";
import { beforeAll, describe, it } from "bun:test";
import {
  constants as stdConstants,
  helpers as stdHelpers,
} from "@evmcrispr/module-std";
import type { CompletionItem, CompletionItemKind } from "@evmcrispr/sdk";
import { expect, helperLabels } from "@evmcrispr/test-utils";
import { type EvmlWorkspace, evml } from "@evmcrispr/test-utils/evml";
import { helpers as tokenHelpers } from "../../src/_generated";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const hasLabel = (items: CompletionItem[], label: string): boolean =>
  items.some((i) => i.label === label);

const onlyKind = (
  items: CompletionItem[],
  kind: CompletionItemKind,
): CompletionItem[] => items.filter((i) => i.kind === kind);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Completions – token helpers", () => {
  let evm: EvmlWorkspace;
  const TOKEN = "load token\n";

  beforeAll(() => {
    evm = evml.workspace();
  });

  const std = helperLabels(stdHelpers, { constants: stdConstants });
  const ADDRESS_HELPERS = std.address;
  const NUMBER_HELPERS = std.number;
  const tokenQualified = helperLabels(tokenHelpers, { module: "token" });

  /**
   * Place the cursor inside a helper's parentheses on line 2 (after the
   * `load token` preamble). `before` is the text before the cursor,
   * `after` closes the expression.
   */
  const helperPos = (before: string, after: string) => ({
    script: TOKEN + before + after,
    position: { line: 2, col: before.length },
  });

  // @token:allowance(token-symbol, address)  →  first arg: custom type, no helpers
  it("@token:allowance(<cursor>) first arg should show no helper completions (custom type)", async () => {
    const { script, position } = helperPos("set $x @token:allowance(", ")");
    const items = await evm.getCompletions(script, position);
    const helperItems = onlyKind(items, "helper");
    expect(helperItems).to.have.lengthOf(0);
  });

  // @token:allowance(token-symbol, address)  →  second arg: address helpers only
  it("@token:allowance(WXDAI <cursor>) second arg should show address-compatible completions", async () => {
    const { script, position } = helperPos(
      "set $x @token:allowance(WXDAI ",
      ")",
    );
    const items = await evm.getCompletions(script, position);
    const helperItems = onlyKind(items, "helper");
    for (const h of ADDRESS_HELPERS) {
      expect(hasLabel(helperItems, h)).to.be.true;
    }
    expect(hasLabel(helperItems, "@date")).to.be.false;
    expect(hasLabel(helperItems, "@hash")).to.be.false;
  });

  // @token:amount(token-symbol, number)  →  second arg: number helpers only
  it("@token:amount(WXDAI <cursor>) second arg should show number-compatible completions", async () => {
    const { script, position } = helperPos("set $x @token:amount(WXDAI ", ")");
    const items = await evm.getCompletions(script, position);
    const helperItems = onlyKind(items, "helper");
    for (const h of NUMBER_HELPERS) {
      expect(hasLabel(helperItems, h)).to.be.true;
    }
    // Loaded-module helpers appear qualified alongside std ones
    for (const h of tokenQualified.number) {
      expect(hasLabel(helperItems, h)).to.be.true;
    }
    expect(hasLabel(helperItems, "@me")).to.be.false;
    expect(hasLabel(helperItems, "@token")).to.be.false;
  });

  // Variables should be included for non-bool/non-block types
  it("@token:allowance(WXDAI <cursor>) should include address-valued variables only", async () => {
    const before = `${TOKEN}set $addr 0x0000000000000000000000000000000000000001\nset $x @token:allowance(WXDAI `;
    const script = `${before})`;
    const position = { line: 3, col: "set $x @token:allowance(WXDAI ".length };
    const items = await evm.getCompletions(script, position);
    const varItems = onlyKind(items, "variable");
    expect(hasLabel(varItems, "$addr")).to.be.true;
  });

  it("@token:allowance($c <cursor>) should show only address variable and address helpers, no duplicates", async () => {
    const addr = "0x0000000000000000000000000000000000000001";
    const before = `${TOKEN}set $a 1\nset $c ${addr}\nexec $c @token:allowance($c `;
    const script = `${before})`;
    const position = { line: 4, col: `exec $c @token:allowance($c `.length };
    const items = await evm.getCompletions(script, position);
    // $c should appear exactly once (address variable)
    const cItems = items.filter((i) => i.label === "$c");
    expect(cItems).to.have.lengthOf(1);
    expect(cItems[0].kind).to.equal("variable");
    // $a should NOT appear (value is 1, not an address)
    expect(hasLabel(items, "$a")).to.be.false;
    // Address-returning helpers should be present
    expect(hasLabel(items, "@me")).to.be.true;
    expect(hasLabel(items, "@ens")).to.be.true;
    // Non-address helpers should NOT be present
    expect(hasLabel(items, "@date")).to.be.false;
  });

  it("@token:amount($c <cursor>) should show only number variable, not address variable", async () => {
    const addr = "0x0000000000000000000000000000000000000001";
    const before = `${TOKEN}set $a 1\nset $c ${addr}\nexec $c @token:amount($c `;
    const script = `${before})`;
    const position = { line: 4, col: `exec $c @token:amount($c `.length };
    const items = await evm.getCompletions(script, position);
    // $a should appear (value is 1, a number)
    expect(hasLabel(items, "$a")).to.be.true;
    // $c should NOT appear (value is an address, not a number)
    expect(hasLabel(items, "$c")).to.be.false;
    // Number-returning helpers should be present
    expect(hasLabel(items, "@date")).to.be.true;
    expect(hasLabel(items, "@token:amount")).to.be.true;
    // Address-returning helpers should NOT be present
    expect(hasLabel(items, "@me")).to.be.false;
    expect(hasLabel(items, "@ens")).to.be.false;
  });

  // Mid-line cursor completions (cursor NOT at end of line)
  it("@token:allowance(WXDAI <cursor>@me) gap between args should show address completions", async () => {
    const { script, position } = helperPos(
      "set $x @token:allowance(WXDAI ",
      "@me)",
    );
    const items = await evm.getCompletions(script, position);
    const helperItems = onlyKind(items, "helper");
    for (const h of ADDRESS_HELPERS) {
      expect(hasLabel(helperItems, h)).to.be.true;
    }
    expect(hasLabel(helperItems, "@date")).to.be.false;
    expect(hasLabel(helperItems, "@hash")).to.be.false;
  });

  it("@token:amount(WXDAI <cursor>@me) mid-line should show number completions", async () => {
    const { script, position } = helperPos(
      "set $x @token:amount(WXDAI ",
      "@me)",
    );
    const items = await evm.getCompletions(script, position);
    const helperItems = onlyKind(items, "helper");
    for (const h of NUMBER_HELPERS) {
      expect(hasLabel(helperItems, h)).to.be.true;
    }
    expect(hasLabel(helperItems, "@me")).to.be.false;
    expect(hasLabel(helperItems, "@token")).to.be.false;
  });

  it("multiline: @token:amount(WXDAI <cursor>@me) mid-line should show number completions", async () => {
    const script = `${TOKEN}set $a 1\nset $x @token:amount(WXDAI @me)`;
    const position = {
      line: 3,
      col: "set $x @token:amount(WXDAI ".length,
    };
    const items = await evm.getCompletions(script, position);
    const helperItems = onlyKind(items, "helper");
    for (const h of NUMBER_HELPERS) {
      expect(hasLabel(helperItems, h)).to.be.true;
    }
    expect(hasLabel(helperItems, "@me")).to.be.false;
  });
});
