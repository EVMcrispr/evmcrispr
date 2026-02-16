import "../setup";
import { beforeAll, describe, it } from "bun:test";

import type { CompletionItem, CompletionItemKind } from "@evmcrispr/sdk";
import { EVMcrispr, expect, getPublicClient } from "@evmcrispr/test-utils";
import type { PublicClient } from "viem";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const labels = (items: CompletionItem[]): string[] => items.map((i) => i.label);

const hasLabel = (items: CompletionItem[], label: string): boolean =>
  items.some((i) => i.label === label);

const onlyKind = (
  items: CompletionItem[],
  kind: CompletionItemKind,
): CompletionItem[] => items.filter((i) => i.kind === kind);

/**
 * Build a position for the cursor at the end of a single-line script.
 * The script string should represent the text *before* the cursor.
 */
const pos = (script: string, line = 1) => ({
  line,
  col: script.split("\n")[line - 1]?.length ?? script.length,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Completions – std commands", () => {
  let evm: EVMcrispr;

  beforeAll(() => {
    const client = getPublicClient();
    evm = new EVMcrispr(client as PublicClient);
  });

  // -------------------------------------------------------------------------
  // load
  // -------------------------------------------------------------------------

  describe("load", () => {
    it('load <cursor> should show available module names (e.g. "aragonos")', async () => {
      const script = "load ";
      const items = await evm.getCompletions(script, pos(script));
      expect(items.length).to.be.greaterThan(0);
      expect(hasLabel(items, "aragonos")).to.be.true;
      expect(hasLabel(items, "sim")).to.be.true;
      // std is already loaded, should not appear
      expect(hasLabel(items, "std")).to.be.false;
      // Module names come through as field items
      const fieldItems = onlyKind(items, "field");
      expect(fieldItems.length).to.be.greaterThan(0);
      expect(hasLabel(fieldItems, "aragonos")).to.be.true;
    });

    it("load aragonos <cursor> should show --as opt", async () => {
      const script = "load aragonos ";
      const items = await evm.getCompletions(script, pos(script));
      expect(hasLabel(items, "--as")).to.be.true;
    });

    it("load --<cursor> should show only --as", async () => {
      const script = "load --";
      const items = await evm.getCompletions(script, pos(script));
      expect(labels(items)).to.deep.equal(["--as"]);
    });
  });

  // -------------------------------------------------------------------------
  // set
  // -------------------------------------------------------------------------

  describe("set", () => {
    it("set <cursor> should return empty (variable type)", async () => {
      const script = "set ";
      const items = await evm.getCompletions(script, pos(script));
      expect(items).to.have.lengthOf(0);
    });

    it("set $x <cursor> should show helpers and variables", async () => {
      const script = "set $x ";
      const items = await evm.getCompletions(script, pos(script));
      expect(items.length).to.be.greaterThan(0);
      const helperItems = onlyKind(items, "helper");
      expect(helperItems.length).to.be.greaterThan(0);
      expect(hasLabel(helperItems, "@me")).to.be.true;
    });
  });

  // -------------------------------------------------------------------------
  // exec
  // -------------------------------------------------------------------------

  describe("exec", () => {
    it("exec <cursor> should show address-type completions", async () => {
      // With a variable defined as an address beforehand
      const script = "set $c 0x0000000000000000000000000000000000000001\nexec ";
      const items = await evm.getCompletions(script, pos(script, 2));
      // Should include address-returning helpers
      expect(hasLabel(items, "@me")).to.be.true;
      expect(hasLabel(items, "@ens")).to.be.true;
      // Should NOT include non-address helpers like @date (returns number)
      expect(hasLabel(items, "@date")).to.be.false;
    });

    it('exec $c f(bool) <cursor> should show true/false (resolveType = "bool")', async () => {
      const script = "exec $c f(bool) ";
      const items = await evm.getCompletions(script, pos(script));
      expect(hasLabel(items, "true")).to.be.true;
      expect(hasLabel(items, "false")).to.be.true;
      // Should NOT include non-bool helpers
      expect(hasLabel(items, "@me")).to.be.false;
      expect(hasLabel(items, "@date")).to.be.false;
      // Should NOT include variables (bool type excludes them)
      expect(onlyKind(items, "variable")).to.have.lengthOf(0);
    });

    it("exec $c f(bool) false <cursor> should show opts (past mandatory + one rest arg)", async () => {
      const script = "exec $c f(bool) false ";
      const items = await evm.getCompletions(script, pos(script));
      // Should include opts since argIndex > rest arg index
      expect(hasLabel(items, "--value")).to.be.true;
      expect(hasLabel(items, "--from")).to.be.true;
      expect(hasLabel(items, "--gas")).to.be.true;
    });

    it("exec $c f(bool) false --<cursor> should show all 6 opts", async () => {
      const script = "exec $c f(bool) false --";
      const items = await evm.getCompletions(script, pos(script));
      const optLabels = labels(items);
      expect(optLabels).to.include("--value");
      expect(optLabels).to.include("--from");
      expect(optLabels).to.include("--gas");
      expect(optLabels).to.include("--max-fee-per-gas");
      expect(optLabels).to.include("--max-priority-fee-per-gas");
      expect(optLabels).to.include("--nonce");
      expect(items).to.have.lengthOf(6);
    });

    it("exec $c f(bool) false --value <cursor> should show only number-compatible items", async () => {
      const script = "exec $c f(bool) false --value ";
      const items = await evm.getCompletions(script, pos(script));
      // Should NOT show true/false (those are bool, not number)
      expect(hasLabel(items, "true")).to.be.false;
      expect(hasLabel(items, "false")).to.be.false;
      // Should include number-returning helpers
      expect(hasLabel(items, "@date")).to.be.true;
      expect(hasLabel(items, "@token.amount")).to.be.true;
      expect(hasLabel(items, "@token.balance")).to.be.true;
      // Should NOT include address-returning helpers
      expect(hasLabel(items, "@me")).to.be.false;
      expect(hasLabel(items, "@ens")).to.be.false;
    });

    it('exec $c f(address,uint256) $a <cursor> should resolve second param to "number"', async () => {
      const script = "exec $c f(address,uint256) $a ";
      const items = await evm.getCompletions(script, pos(script));
      // Number-returning helpers should be present
      expect(hasLabel(items, "@date")).to.be.true;
      // Address-returning helpers should NOT be present (type is number, not address)
      expect(hasLabel(items, "@me")).to.be.false;
      // Bool items should NOT be present
      expect(hasLabel(items, "true")).to.be.false;
    });

    it("already-used opts should be filtered out", async () => {
      const script = "exec $c f() --value 1 --";
      const items = await evm.getCompletions(script, pos(script));
      expect(hasLabel(items, "--value")).to.be.false;
      expect(hasLabel(items, "--from")).to.be.true;
      expect(items).to.have.lengthOf(5);
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
  });

  // -------------------------------------------------------------------------
  // raw
  // -------------------------------------------------------------------------

  describe("raw", () => {
    it("raw <cursor> should show address-type completions", async () => {
      const script = "raw ";
      const items = await evm.getCompletions(script, pos(script));
      // Should include address-returning helpers
      expect(hasLabel(items, "@me")).to.be.true;
      expect(hasLabel(items, "@ens")).to.be.true;
    });

    it("raw $c 0x1234 <cursor> should show optional number completions AND opts", async () => {
      const script = "raw $c 0x1234 ";
      const items = await evm.getCompletions(script, pos(script));
      // Optional arg is "number" type; number-returning helpers
      expect(hasLabel(items, "@date")).to.be.true;
      // Should also show opts since all mandatory args are filled
      expect(hasLabel(items, "--from")).to.be.true;
      expect(hasLabel(items, "--gas")).to.be.true;
    });

    it("raw $c 0x1234 --<cursor> should show opts", async () => {
      const script = "raw $c 0x1234 --";
      const items = await evm.getCompletions(script, pos(script));
      expect(hasLabel(items, "--from")).to.be.true;
      expect(hasLabel(items, "--gas")).to.be.true;
      expect(hasLabel(items, "--max-fee-per-gas")).to.be.true;
      // All items should be field kind
      for (const item of items) {
        expect(item.kind).to.equal("field");
      }
    });
  });

  // -------------------------------------------------------------------------
  // sign
  // -------------------------------------------------------------------------

  describe("sign", () => {
    it("sign <cursor> should return empty (variable type)", async () => {
      const script = "sign ";
      const items = await evm.getCompletions(script, pos(script));
      expect(items).to.have.lengthOf(0);
    });

    it("sign $v <cursor> should show string completions and --typed opt", async () => {
      const script = "sign $v ";
      const items = await evm.getCompletions(script, pos(script));
      // Optional arg is "string" type; should show all helpers (string is compatible with all)
      expect(hasLabel(items, "--typed")).to.be.true;
    });

    it('sign $v "msg" <cursor> should show only --typed opt', async () => {
      const script = 'sign $v "msg" ';
      const items = await evm.getCompletions(script, pos(script));
      expect(labels(items)).to.deep.equal(["--typed"]);
    });
  });

  // -------------------------------------------------------------------------
  // switch
  // -------------------------------------------------------------------------

  describe("switch", () => {
    it("switch <cursor> should show chain names", async () => {
      const script = "switch ";
      const items = await evm.getCompletions(script, pos(script));
      expect(items.length).to.be.greaterThan(0);
      // Should include well-known chain names
      expect(hasLabel(items, "mainnet")).to.be.true;
      expect(hasLabel(items, "optimism")).to.be.true;
      expect(hasLabel(items, "gnosis")).to.be.true;
      // All should be field kind (from fieldItem)
      for (const item of items) {
        expect(item.kind).to.equal("field");
      }
    });
  });

  // -------------------------------------------------------------------------
  // print
  // -------------------------------------------------------------------------

  describe("print", () => {
    it("print <cursor> should show all helpers and variables", async () => {
      const script = "print ";
      const items = await evm.getCompletions(script, pos(script));
      // "any" type shows all helpers
      expect(hasLabel(items, "@me")).to.be.true;
      expect(hasLabel(items, "@date")).to.be.true;
    });

    it('print "hello" <cursor> should show completions but no opts (print has none)', async () => {
      const script = 'print "hello" ';
      const items = await evm.getCompletions(script, pos(script));
      // Should still show helpers/vars for the rest arg
      expect(hasLabel(items, "@me")).to.be.true;
      // No opts defined for print
      const optItems = items.filter((i) => i.label.startsWith("--"));
      expect(optItems).to.have.lengthOf(0);
    });
  });

  // -------------------------------------------------------------------------
  // batch
  // -------------------------------------------------------------------------

  describe("batch", () => {
    it("batch <cursor> should show block snippet", async () => {
      const script = "batch ";
      const items = await evm.getCompletions(script, pos(script));
      expect(hasLabel(items, "( ... )")).to.be.true;
      const blockItem = items.find((i) => i.label === "( ... )");
      expect(blockItem?.isSnippet).to.be.true;
    });
  });

  // -------------------------------------------------------------------------
  // for
  // -------------------------------------------------------------------------

  describe("for", () => {
    it('for $i <cursor> should show "of" (completion override)', async () => {
      const script = "for $i ";
      const items = await evm.getCompletions(script, pos(script));
      expect(hasLabel(items, "of")).to.be.true;
      expect(items).to.have.lengthOf(1);
    });

    it("for $i of <cursor> should show helpers and variables", async () => {
      const script = "for $i of ";
      const items = await evm.getCompletions(script, pos(script));
      expect(hasLabel(items, "@me")).to.be.true;
    });

    it("for $i of $arr <cursor> should show block snippet", async () => {
      const script = "for $i of $arr ";
      const items = await evm.getCompletions(script, pos(script));
      expect(hasLabel(items, "( ... )")).to.be.true;
    });
  });

  // -------------------------------------------------------------------------
  // halt
  // -------------------------------------------------------------------------

  describe("halt", () => {
    it("halt <cursor> should return empty (no args, no opts)", async () => {
      const script = "halt ";
      const items = await evm.getCompletions(script, pos(script));
      expect(items).to.have.lengthOf(0);
    });
  });

  // -------------------------------------------------------------------------
  // Cross-cutting concerns
  // -------------------------------------------------------------------------

  describe("cross-cutting", () => {
    it("variables defined by set are available in later completions", async () => {
      const script = "set $myVar 123\nset $x ";
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "$myVar")).to.be.true;
    });

    it("--from <cursor> in exec should show address-compatible items", async () => {
      const script = "exec $c f() --from ";
      const items = await evm.getCompletions(script, pos(script));
      // --from type is "address"
      expect(hasLabel(items, "@me")).to.be.true;
      expect(hasLabel(items, "@ens")).to.be.true;
      // Non-address helpers should be excluded
      expect(hasLabel(items, "@date")).to.be.false;
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
});
