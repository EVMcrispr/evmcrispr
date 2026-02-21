import "../setup";
import { beforeAll, describe, it } from "bun:test";

import type { CompletionItem, CompletionItemKind } from "@evmcrispr/sdk";
import { EVMcrispr, expect, getPublicClient } from "@evmcrispr/test-utils";
import type { Address, PublicClient } from "viem";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const labels = (items: CompletionItem[]): string[] => items.map((i) => i.label);

const onlyKind = (
  items: CompletionItem[],
  kind: CompletionItemKind,
): CompletionItem[] => items.filter((i) => i.kind === kind);

const pos = (script: string, line = 1) => ({
  line,
  col: script.split("\n")[line - 1]?.length ?? script.length,
});

// ---------------------------------------------------------------------------
// Tests – ABI-dependent completions (require a running RPC node)
// ---------------------------------------------------------------------------

describe("Completions – std exec ABI fetching", () => {
  let evm: EVMcrispr;

  beforeAll(() => {
    const client = getPublicClient();
    evm = new EVMcrispr(client as PublicClient);
  });

  it("exec <wxdai-address> <cursor> should fetch ABI and show function signatures", async () => {
    const wxdai = "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d";
    const script = `exec ${wxdai} `;
    const items = await evm.getCompletions(script, pos(script));
    const fieldItems = onlyKind(items, "field");
    expect(fieldItems.length).to.be.greaterThan(0);
    const fnLabels = labels(fieldItems);
    // WETH/WXDAI payable + nonpayable functions
    expect(fnLabels.some((l) => l.startsWith("deposit"))).to.be.true;
    expect(fnLabels.some((l) => l.startsWith("withdraw"))).to.be.true;
    expect(fnLabels.some((l) => l.startsWith("approve"))).to.be.true;
    expect(fnLabels.some((l) => l.startsWith("transfer("))).to.be.true;
    expect(fnLabels.some((l) => l.startsWith("transferFrom"))).to.be.true;
    // View functions should NOT appear (only payable/nonpayable)
    expect(fnLabels.some((l) => l.startsWith("totalSupply"))).to.be.false;
    expect(fnLabels.some((l) => l.startsWith("balanceOf"))).to.be.false;
  });

  it("exec <proxy> <cursor> should show both proxy and implementation signatures", async () => {
    const PROXY: Address = "0xc6B7AcA6DE8a6044E0e32d0c841a89244A10D284";
    const script = `exec ${PROXY} `;
    const items = await evm.getCompletions(script, pos(script));
    const fieldItems = onlyKind(items, "field");
    expect(fieldItems.length).to.be.greaterThan(0);

    const fnLabels = labels(fieldItems);
    // Implementation functions (aToken)
    expect(fnLabels.some((l) => l.startsWith("mint("))).to.be.true;
    expect(fnLabels.some((l) => l.startsWith("burn("))).to.be.true;
    // Proxy admin functions
    expect(fnLabels.some((l) => l.startsWith("upgradeTo("))).to.be.true;
    // View functions should NOT appear
    expect(fnLabels.some((l) => l.startsWith("totalSupply"))).to.be.false;
    expect(fnLabels.some((l) => l.startsWith("balanceOf"))).to.be.false;
  });

  it("set $c <address> then exec $c <cursor> should resolve variable and fetch ABI", async () => {
    const wxdai = "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d";
    const script = `set $c ${wxdai}\nexec $c `;
    const items = await evm.getCompletions(script, pos(script, 2));
    const fieldItems = onlyKind(items, "field");
    expect(fieldItems.length).to.be.greaterThan(0);
    const fnLabels = labels(fieldItems);
    expect(fnLabels.some((l) => l.startsWith("approve"))).to.be.true;
    expect(fnLabels.some((l) => l.startsWith("transfer("))).to.be.true;
  });

  it("set $c @token(WXDAI) then exec $c <cursor> should resolve helper and fetch ABI", async () => {
    const script = "set $c @token(WXDAI)\nexec $c ";
    const items = await evm.getCompletions(script, pos(script, 2));
    const fieldItems = onlyKind(items, "field");
    expect(fieldItems.length).to.be.greaterThan(0);
    const fnLabels = labels(fieldItems);
    expect(fnLabels.some((l) => l.startsWith("approve"))).to.be.true;
    expect(fnLabels.some((l) => l.startsWith("transfer("))).to.be.true;
    expect(fnLabels.some((l) => l.startsWith("transferFrom"))).to.be.true;
    // View functions should NOT appear
    expect(fnLabels.some((l) => l.startsWith("totalSupply"))).to.be.false;
    expect(fnLabels.some((l) => l.startsWith("balanceOf"))).to.be.false;
  });

  it("helper results are cached across completions calls", async () => {
    const script1 = "set $c @token(WXDAI)\nexec $c ";
    const items1 = await evm.getCompletions(script1, pos(script1, 2));
    expect(onlyKind(items1, "field").length).to.be.greaterThan(0);

    // Second call with same helper — should use cache (fast, same result)
    const script2 = "set $c @token(WXDAI)\nexec $c ";
    const items2 = await evm.getCompletions(script2, pos(script2, 2));
    expect(onlyKind(items2, "field").length).to.be.greaterThan(0);
    expect(labels(onlyKind(items1, "field"))).to.deep.equal(
      labels(onlyKind(items2, "field")),
    );
  });

  it("flushCache clears helper cache so next call re-resolves", async () => {
    const script = "set $c @token(WXDAI)\nexec $c ";
    const items1 = await evm.getCompletions(script, pos(script, 2));
    expect(onlyKind(items1, "field").length).to.be.greaterThan(0);

    evm.flushCache();

    // After flush, should still work (re-resolves the helper)
    const items2 = await evm.getCompletions(script, pos(script, 2));
    expect(onlyKind(items2, "field").length).to.be.greaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Tests – @get read-abi completions (view/pure functions with return types)
// ---------------------------------------------------------------------------

describe("Completions – @get read-abi ABI fetching", () => {
  let evm: EVMcrispr;

  const hasLabel = (items: CompletionItem[], label: string): boolean =>
    items.some((i) => i.label === label);

  const helperPos = (before: string, after: string) => ({
    script: before + after,
    position: { line: 1, col: before.length },
  });

  beforeAll(() => {
    const client = getPublicClient();
    evm = new EVMcrispr(client as PublicClient);
  });

  it("@get(<wxdai-address>, <cursor>) should show view/pure functions with return types", async () => {
    const wxdai = "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d";
    const { script, position } = helperPos(
      `set $x @get(${wxdai}, `,
      ")",
    );
    const items = await evm.getCompletions(script, position);
    const fieldItems = onlyKind(items, "field");
    expect(fieldItems.length).to.be.greaterThan(0);
    const fnLabels = labels(fieldItems);
    // View functions should appear with return types
    expect(fnLabels.some((l) => l.startsWith("totalSupply()"))).to.be.true;
    expect(fnLabels.some((l) => l.startsWith("balanceOf("))).to.be.true;
    expect(fnLabels.some((l) => l.startsWith("allowance("))).to.be.true;
    // Write functions should NOT appear
    expect(fnLabels.some((l) => l.startsWith("approve("))).to.be.false;
    expect(fnLabels.some((l) => l.startsWith("transfer("))).to.be.false;
    expect(fnLabels.some((l) => l.startsWith("deposit"))).to.be.false;
  });

  it("read-abi completions should use adjacent-parens format fn(inputs)(outputs)", async () => {
    const wxdai = "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d";
    const { script, position } = helperPos(
      `set $x @get(${wxdai}, `,
      ")",
    );
    const items = await evm.getCompletions(script, position);
    const fieldItems = onlyKind(items, "field");
    // Each completion should have adjacent-parens format with return type
    expect(hasLabel(fieldItems, "totalSupply()(uint256)")).to.be.true;
    expect(hasLabel(fieldItems, "balanceOf(address)(uint256)")).to.be.true;
  });

  it("@get($var, <cursor>) should resolve variable and show read-abi completions", async () => {
    const wxdai = "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d";
    const script = `set $a ${wxdai}\nset $x @get($a, )`;
    const position = { line: 2, col: "set $x @get($a, ".length };
    const items = await evm.getCompletions(script, position);
    const fieldItems = onlyKind(items, "field");
    expect(fieldItems.length).to.be.greaterThan(0);
    expect(hasLabel(fieldItems, "totalSupply()(uint256)")).to.be.true;
    // Write functions should NOT appear
    const fnLabels = labels(fieldItems);
    expect(fnLabels.some((l) => l.startsWith("approve("))).to.be.false;
  });

  it("@get($var, <cursor>) nested inside exec should show read-abi completions", async () => {
    const wxdai = "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d";
    const script = `set $a ${wxdai}\nexec $a f(uint256) @get($a, )`;
    const position = { line: 2, col: "exec $a f(uint256) @get($a, ".length };
    const items = await evm.getCompletions(script, position);
    const fieldItems = onlyKind(items, "field");
    expect(fieldItems.length).to.be.greaterThan(0);
    expect(hasLabel(fieldItems, "totalSupply()(uint256)")).to.be.true;
  });
});
