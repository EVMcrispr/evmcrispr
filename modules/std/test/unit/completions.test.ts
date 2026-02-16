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

// ---------------------------------------------------------------------------
// Helper completions
// ---------------------------------------------------------------------------

describe("Completions – std helpers", () => {
  let evm: EVMcrispr;

  beforeAll(() => {
    const client = getPublicClient();
    evm = new EVMcrispr(client as PublicClient);
  });

  // All 12 std helpers
  const ALL_HELPERS = [
    "@abi.encodeCall",
    "@date",
    "@ens",
    "@get",
    "@id",
    "@ipfs",
    "@me",
    "@namehash",
    "@nextContract",
    "@token",
    "@token.amount",
    "@token.balance",
  ];

  const ADDRESS_HELPERS = ["@ens", "@get", "@me", "@nextContract", "@token"];
  const NUMBER_HELPERS = ["@date", "@get", "@token.amount", "@token.balance"];
  const BYTES32_HELPERS = ["@get", "@id", "@namehash"];
  const BYTES_HELPERS = ["@abi.encodeCall", "@get"];

  // -------------------------------------------------------------------------
  // Helpers as suggestions – type filtering
  // -------------------------------------------------------------------------

  describe("helpers as suggestions", () => {
    it('print <cursor> (type "any") should show all 12 helpers', async () => {
      const script = "print ";
      const items = await evm.getCompletions(script, pos(script));
      const helperItems = onlyKind(items, "helper");
      for (const h of ALL_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(helperItems).to.have.lengthOf(ALL_HELPERS.length);
    });

    it("all helper items should have kind = helper", async () => {
      const script = "print ";
      const items = await evm.getCompletions(script, pos(script));
      const helperItems = onlyKind(items, "helper");
      for (const item of helperItems) {
        expect(item.kind).to.equal("helper");
      }
    });

    it("exec <cursor> (address context) should show only address-compatible helpers", async () => {
      const script = "set $c 0x0000000000000000000000000000000000000001\nexec ";
      const items = await evm.getCompletions(script, pos(script, 2));
      const helperItems = onlyKind(items, "helper");
      for (const h of ADDRESS_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      // Non-address helpers should be excluded
      expect(hasLabel(helperItems, "@date")).to.be.false;
      expect(hasLabel(helperItems, "@id")).to.be.false;
      expect(hasLabel(helperItems, "@ipfs")).to.be.false;
      expect(hasLabel(helperItems, "@abi.encodeCall")).to.be.false;
    });

    it("exec $c f(uint256) <cursor> (number context) should show only number-compatible helpers", async () => {
      const script = "exec $c f(uint256) ";
      const items = await evm.getCompletions(script, pos(script));
      const helperItems = onlyKind(items, "helper");
      for (const h of NUMBER_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(hasLabel(helperItems, "@me")).to.be.false;
      expect(hasLabel(helperItems, "@token")).to.be.false;
      expect(hasLabel(helperItems, "@ens")).to.be.false;
    });

    it("exec $c f(bytes32) <cursor> should show only bytes32-compatible helpers", async () => {
      const script = "exec $c f(bytes32) ";
      const items = await evm.getCompletions(script, pos(script));
      const helperItems = onlyKind(items, "helper");
      for (const h of BYTES32_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(hasLabel(helperItems, "@me")).to.be.false;
      expect(hasLabel(helperItems, "@date")).to.be.false;
    });

    it("exec $c f(bytes) <cursor> should show only bytes-compatible helpers", async () => {
      const script = "exec $c f(bytes) ";
      const items = await evm.getCompletions(script, pos(script));
      const helperItems = onlyKind(items, "helper");
      for (const h of BYTES_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(hasLabel(helperItems, "@me")).to.be.false;
      expect(hasLabel(helperItems, "@date")).to.be.false;
      expect(hasLabel(helperItems, "@id")).to.be.false;
    });

    it('exec $c f(bool) <cursor> should show only @get (returnType "any")', async () => {
      const script = "exec $c f(bool) ";
      const items = await evm.getCompletions(script, pos(script));
      const helperItems = onlyKind(items, "helper");
      expect(helperItems).to.have.lengthOf(1);
      expect(hasLabel(helperItems, "@get")).to.be.true;
    });

    it("exec $c f(string) <cursor> should show all helpers (string accepts all)", async () => {
      const script = "exec $c f(string) ";
      const items = await evm.getCompletions(script, pos(script));
      const helperItems = onlyKind(items, "helper");
      for (const h of ALL_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
    });
  });

  // -------------------------------------------------------------------------
  // Snippet metadata
  // -------------------------------------------------------------------------

  describe("snippet metadata", () => {
    it("helpers with args should have isSnippet = true", async () => {
      const script = "print ";
      const items = await evm.getCompletions(script, pos(script));
      const helperItems = onlyKind(items, "helper");
      const withArgs = helperItems.filter((i) => i.label !== "@me");
      for (const item of withArgs) {
        expect(item.isSnippet).to.be.true;
      }
    });

    it("@me (no args) should have isSnippet falsy", async () => {
      const script = "print ";
      const items = await evm.getCompletions(script, pos(script));
      const me = items.find((i) => i.label === "@me");
      expect(me).to.exist;
      expect(me!.isSnippet).to.not.be.true;
    });

    it("helpers with args should have insertText with ($0) snippet", async () => {
      const script = "print ";
      const items = await evm.getCompletions(script, pos(script));
      const token = items.find((i) => i.label === "@token");
      expect(token).to.exist;
      expect(token!.insertText).to.equal("@token($0)");
    });

    it("@me should have insertText with trailing space (no parens)", async () => {
      const script = "print ";
      const items = await evm.getCompletions(script, pos(script));
      const me = items.find((i) => i.label === "@me");
      expect(me).to.exist;
      expect(me!.insertText).to.equal("@me ");
    });
  });

  // -------------------------------------------------------------------------
  // Helper argument completions
  // -------------------------------------------------------------------------

  describe("helper argument completions", () => {
    /**
     * Place the cursor inside a helper's parentheses.
     * `before` is the text before the cursor, `after` closes the expression.
     */
    const helperPos = (before: string, after: string) => ({
      script: before + after,
      position: { line: 1, col: before.length },
    });

    // @token(string)  →  all helpers (string accepts all)
    it("@token(<cursor>) should show string-compatible completions", async () => {
      const { script, position } = helperPos("set $x @token(", ")");
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of ALL_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
    });

    // @token.balance(string, address)  →  first arg: string (all helpers)
    it("@token.balance(<cursor>) first arg should show string-compatible completions", async () => {
      const { script, position } = helperPos("set $x @token.balance(", ")");
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of ALL_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
    });

    // @token.balance(string, address)  →  second arg: address helpers only
    it("@token.balance(WXDAI, <cursor>) second arg should show address-compatible completions", async () => {
      const { script, position } = helperPos(
        "set $x @token.balance(WXDAI, ",
        ")",
      );
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of ADDRESS_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(hasLabel(helperItems, "@date")).to.be.false;
      expect(hasLabel(helperItems, "@id")).to.be.false;
    });

    // @token.amount(string, number)  →  second arg: number helpers only
    it("@token.amount(WXDAI, <cursor>) second arg should show number-compatible completions", async () => {
      const { script, position } = helperPos(
        "set $x @token.amount(WXDAI, ",
        ")",
      );
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of NUMBER_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(hasLabel(helperItems, "@me")).to.be.false;
      expect(hasLabel(helperItems, "@token")).to.be.false;
    });

    // @get(address, string, ...any)  →  first arg: address helpers
    it("@get(<cursor>) first arg should show address-compatible completions", async () => {
      const { script, position } = helperPos("set $x @get(", ")");
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of ADDRESS_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(hasLabel(helperItems, "@date")).to.be.false;
    });

    // @get(address, string, ...any)  →  rest arg resolves type from signature
    it('@get($addr, "fn(uint256)", <cursor>) rest arg should resolve to number from signature', async () => {
      const { script, position } = helperPos(
        'set $x @get($addr, "fn(uint256)", v',
        ")",
      );
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of NUMBER_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      // Non-number helpers should NOT be present
      expect(hasLabel(helperItems, "@me")).to.be.false;
      expect(hasLabel(helperItems, "@ens")).to.be.false;
    });

    // @get multi-param: first rest arg resolves to number
    it('@get($addr, "fn(uint256,bool)", <cursor>) first rest arg should resolve to number', async () => {
      const { script, position } = helperPos(
        'set $x @get($addr, "fn(uint256,bool)", ',
        ")",
      );
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of NUMBER_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(hasLabel(helperItems, "@me")).to.be.false;
      // Should NOT show true/false (number, not bool)
      expect(hasLabel(items, "true")).to.be.false;
      expect(hasLabel(items, "false")).to.be.false;
    });

    // @get multi-param: second rest arg resolves to bool
    it('@get($addr, "fn(uint256,bool)", 3, <cursor>) second rest arg should resolve to bool', async () => {
      const { script, position } = helperPos(
        'set $x @get($addr, "fn(uint256,bool)", 3, ',
        ")",
      );
      const items = await evm.getCompletions(script, position);
      // Should show true/false
      expect(hasLabel(items, "true")).to.be.true;
      expect(hasLabel(items, "false")).to.be.true;
      // Only @get (returnType "any") should be compatible with bool
      const helperItems = onlyKind(items, "helper");
      expect(helperItems).to.have.lengthOf(1);
      expect(hasLabel(helperItems, "@get")).to.be.true;
    });

    // Unclosed parens: same scenarios without closing ")"
    it('@get($addr, "fn(uint256,bool)", <cursor> (no closing paren) should still resolve to number', async () => {
      const script = 'set $x @get($addr, "fn(uint256,bool)", ';
      const position = { line: 1, col: script.length };
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of NUMBER_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(hasLabel(helperItems, "@me")).to.be.false;
    });

    it('@get($addr, "fn(uint256,bool)", 3, <cursor> (no closing paren) should still resolve to bool', async () => {
      const script = 'set $x @get($addr, "fn(uint256,bool)", 3, ';
      const position = { line: 1, col: script.length };
      const items = await evm.getCompletions(script, position);
      expect(hasLabel(items, "true")).to.be.true;
      expect(hasLabel(items, "false")).to.be.true;
      const helperItems = onlyKind(items, "helper");
      expect(helperItems).to.have.lengthOf(1);
      expect(hasLabel(helperItems, "@get")).to.be.true;
    });

    // @get(address, string, ...any)  →  rest arg with bool signature
    it('@get($addr, "bo(bool)", <cursor>) rest arg should resolve to bool from signature', async () => {
      const { script, position } = helperPos(
        'set $x @get($addr, "bo(bool)", ',
        ")",
      );
      const items = await evm.getCompletions(script, position);
      // Should show true/false
      expect(hasLabel(items, "true")).to.be.true;
      expect(hasLabel(items, "false")).to.be.true;
      // Only @get (returnType "any") should be compatible with bool
      const helperItems = onlyKind(items, "helper");
      expect(helperItems).to.have.lengthOf(1);
      expect(hasLabel(helperItems, "@get")).to.be.true;
    });

    // @nextContract(address, number?)  →  first arg: address
    it("@nextContract(<cursor>) first arg should show address-compatible completions", async () => {
      const { script, position } = helperPos("set $x @nextContract(", ")");
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of ADDRESS_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(hasLabel(helperItems, "@date")).to.be.false;
    });

    // @nextContract(address, number?)  →  second arg: number
    it("@nextContract($addr, <cursor>) second arg should show number-compatible completions", async () => {
      const { script, position } = helperPos(
        "set $x @nextContract($addr, ",
        ")",
      );
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of NUMBER_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(hasLabel(helperItems, "@me")).to.be.false;
    });

    // @ens(string)  →  all helpers
    it("@ens(<cursor>) should show string-compatible completions", async () => {
      const { script, position } = helperPos("set $x @ens(", ")");
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of ALL_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
    });

    // @date(string, string?)  →  all helpers
    it("@date(<cursor>) should show string-compatible completions", async () => {
      const { script, position } = helperPos("set $x @date(", ")");
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of ALL_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
    });

    // @id(string)  →  all helpers
    it("@id(<cursor>) should show string-compatible completions", async () => {
      const { script, position } = helperPos("set $x @id(", ")");
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of ALL_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
    });

    // @namehash(string)  →  all helpers
    it("@namehash(<cursor>) should show string-compatible completions", async () => {
      const { script, position } = helperPos("set $x @namehash(", ")");
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of ALL_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
    });

    // @abi.encodeCall(string, ...any)  →  first arg: string (all helpers)
    it("@abi.encodeCall(<cursor>) first arg should show string-compatible completions", async () => {
      const { script, position } = helperPos("set $x @abi.encodeCall(", ")");
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of ALL_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
    });

    // @ipfs(string)  →  all helpers
    it("@ipfs(<cursor>) should show string-compatible completions", async () => {
      const { script, position } = helperPos("set $x @ipfs(", ")");
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of ALL_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
    });

    // Variables should be included for non-bool/non-block types
    it("@token.balance(WXDAI, <cursor>) should include address-valued variables only", async () => {
      const before =
        "set $addr 0x0000000000000000000000000000000000000001\nset $x @token.balance(WXDAI, ";
      const after = ")";
      const script = before + after;
      const position = { line: 2, col: "set $x @token.balance(WXDAI, ".length };
      const items = await evm.getCompletions(script, position);
      const varItems = onlyKind(items, "variable");
      expect(hasLabel(varItems, "$addr")).to.be.true;
    });

    it("@token.balance($c, <cursor>) should show only address variable and address helpers, no duplicates", async () => {
      const addr = "0x0000000000000000000000000000000000000001";
      const before = `set $a 1\nset $c ${addr}\nexec $c @token.balance($c, `;
      const after = ")";
      const script = before + after;
      const position = { line: 3, col: `exec $c @token.balance($c, `.length };
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

    it("@token.amount($c, <cursor>) should show only number variable, not address variable", async () => {
      const addr = "0x0000000000000000000000000000000000000001";
      const before = `set $a 1\nset $c ${addr}\nexec $c @token.amount($c, `;
      const after = ")";
      const script = before + after;
      const position = { line: 3, col: `exec $c @token.amount($c, `.length };
      const items = await evm.getCompletions(script, position);
      // $a should appear (value is 1, a number)
      expect(hasLabel(items, "$a")).to.be.true;
      // $c should NOT appear (value is an address, not a number)
      expect(hasLabel(items, "$c")).to.be.false;
      // Number-returning helpers should be present
      expect(hasLabel(items, "@date")).to.be.true;
      expect(hasLabel(items, "@token.amount")).to.be.true;
      // Address-returning helpers should NOT be present
      expect(hasLabel(items, "@me")).to.be.false;
      expect(hasLabel(items, "@ens")).to.be.false;
    });
  });
});
