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

const pos = (script: string, line = 1) => ({
  line,
  col: script.split("\n")[line - 1]?.length ?? script.length,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Completions – giveth commands", () => {
  let evm: EVMcrispr;
  const GIVETH = "load giveth\n";

  beforeAll(() => {
    const client = getPublicClient();
    evm = new EVMcrispr(client as PublicClient);
  });

  // -------------------------------------------------------------------------
  // donate
  // -------------------------------------------------------------------------

  describe("donate", () => {
    it("donate <cursor> should show string-compatible items for slug", async () => {
      const script = `${GIVETH}giveth:donate `;
      const items = await evm.getCompletions(script, pos(script, 2));
      // "string" type accepts all helpers
      expect(hasLabel(items, "@me")).to.be.true;
      expect(hasLabel(items, "@date")).to.be.true;
    });

    it("donate $slug <cursor> should show number-compatible items for amount", async () => {
      const script = `${GIVETH}giveth:donate $slug `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "@date")).to.be.true;
      expect(hasLabel(items, "@token.amount")).to.be.true;
      // Should NOT include address-returning helpers
      expect(hasLabel(items, "@me")).to.be.false;
    });

    it("donate $slug 100 <cursor> should show address-compatible items for tokenAddr", async () => {
      const script = `${GIVETH}giveth:donate $slug 100 `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "@me")).to.be.true;
      expect(hasLabel(items, "@ens")).to.be.true;
      // Should NOT include number-only helpers
      expect(hasLabel(items, "@date")).to.be.false;
    });
  });

  // -------------------------------------------------------------------------
  // finalize-givbacks
  // -------------------------------------------------------------------------

  describe("finalize-givbacks", () => {
    it("finalize-givbacks <cursor> should show all helpers (any type)", async () => {
      const script = `${GIVETH}giveth:finalize-givbacks `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "@me")).to.be.true;
      expect(hasLabel(items, "@date")).to.be.true;
    });

    it("finalize-givbacks $hash <cursor> should show --relayer opt", async () => {
      const script = `${GIVETH}giveth:finalize-givbacks $hash `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "--relayer")).to.be.true;
    });

    it("finalize-givbacks $hash --<cursor> should show only --relayer", async () => {
      const script = `${GIVETH}giveth:finalize-givbacks $hash --`;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(labels(items)).to.deep.equal(["--relayer"]);
    });
  });

  // -------------------------------------------------------------------------
  // initiate-givbacks
  // -------------------------------------------------------------------------

  describe("initiate-givbacks", () => {
    it("initiate-givbacks <cursor> should show all helpers (any type)", async () => {
      const script = `${GIVETH}giveth:initiate-givbacks `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "@me")).to.be.true;
    });

    it("initiate-givbacks $hash <cursor> should show --relayer opt", async () => {
      const script = `${GIVETH}giveth:initiate-givbacks $hash `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "--relayer")).to.be.true;
    });

    it("initiate-givbacks --<cursor> should show only --relayer", async () => {
      const script = `${GIVETH}giveth:initiate-givbacks --`;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(labels(items)).to.deep.equal(["--relayer"]);
    });
  });

  // -------------------------------------------------------------------------
  // verify-givbacks
  // -------------------------------------------------------------------------

  describe("verify-givbacks", () => {
    it("verify-givbacks <cursor> should show all helpers (any type)", async () => {
      const script = `${GIVETH}giveth:verify-givbacks `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "@me")).to.be.true;
      expect(hasLabel(items, "@date")).to.be.true;
    });

    it("verify-givbacks $hash <cursor> should show all helpers (any type) for voteId", async () => {
      const script = `${GIVETH}giveth:verify-givbacks $hash `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "@me")).to.be.true;
    });

    it("verify-givbacks $hash $voteId <cursor> should show --relayer opt", async () => {
      const script = `${GIVETH}giveth:verify-givbacks $hash $voteId `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "--relayer")).to.be.true;
    });

    it("verify-givbacks $hash $voteId --<cursor> should show only --relayer", async () => {
      const script = `${GIVETH}giveth:verify-givbacks $hash $voteId --`;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(labels(items)).to.deep.equal(["--relayer"]);
    });
  });

  // -------------------------------------------------------------------------
  // Cross-cutting: giveth helper visibility
  // -------------------------------------------------------------------------

  describe("giveth helpers", () => {
    it("@projectAddr should appear in completions after loading giveth module", async () => {
      const script = `${GIVETH}set $x `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const helperItems = onlyKind(items, "helper");
      expect(hasLabel(helperItems, "@projectAddr")).to.be.true;
    });
  });
});

// ---------------------------------------------------------------------------
// Helper completions
// ---------------------------------------------------------------------------

describe("Completions – giveth helpers", () => {
  let evm: EVMcrispr;

  beforeAll(() => {
    const client = getPublicClient();
    evm = new EVMcrispr(client as PublicClient);
  });

  // All 12 std helpers + 1 giveth helper = 13
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
    "@projectAddr",
    "@token",
    "@token.amount",
    "@token.balance",
  ];

  // Address-returning helpers (std 5 + giveth 1)
  const ADDRESS_HELPERS = [
    "@ens",
    "@get",
    "@me",
    "@nextContract",
    "@projectAddr",
    "@token",
  ];

  const NUMBER_HELPERS = ["@date", "@get", "@token.amount", "@token.balance"];

  const GIVETH = "load giveth\n";

  // -------------------------------------------------------------------------
  // Helpers as suggestions – type filtering
  // -------------------------------------------------------------------------

  describe("helpers as suggestions", () => {
    it('set $x <cursor> (type "any") should show all 13 helpers', async () => {
      const script = `${GIVETH}set $x `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const helperItems = onlyKind(items, "helper");
      for (const h of ALL_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(helperItems).to.have.lengthOf(ALL_HELPERS.length);
    });

    it("exec <cursor> (address context) should include @projectAddr", async () => {
      const script = `${GIVETH}set $c 0x0000000000000000000000000000000000000001\nexec `;
      const items = await evm.getCompletions(script, pos(script, 3));
      const helperItems = onlyKind(items, "helper");
      for (const h of ADDRESS_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(hasLabel(helperItems, "@date")).to.be.false;
      expect(hasLabel(helperItems, "@id")).to.be.false;
    });

    it("exec $c f(uint256) <cursor> (number context) should NOT include @projectAddr", async () => {
      const script = `${GIVETH}exec $c f(uint256) `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const helperItems = onlyKind(items, "helper");
      for (const h of NUMBER_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(hasLabel(helperItems, "@projectAddr")).to.be.false;
    });
  });

  // -------------------------------------------------------------------------
  // Snippet metadata
  // -------------------------------------------------------------------------

  describe("snippet metadata", () => {
    it("@projectAddr should have isSnippet = true and insertText with ($0)", async () => {
      const script = `${GIVETH}print `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const projectAddr = items.find((i) => i.label === "@projectAddr");
      expect(projectAddr).to.exist;
      expect(projectAddr!.isSnippet).to.be.true;
      expect(projectAddr!.insertText).to.equal("@projectAddr($0)");
    });
  });

  // -------------------------------------------------------------------------
  // Helper argument completions
  // -------------------------------------------------------------------------

  describe("helper argument completions", () => {
    /**
     * Place the cursor inside a helper's parentheses on line 2
     * (after the "load giveth" prefix on line 1).
     */
    const helperPos = (before: string, after: string) => ({
      script: `${GIVETH}${before}${after}`,
      position: { line: 2, col: before.length },
    });

    // @projectAddr(string) -> all helpers (string accepts all)
    it("@projectAddr(<cursor>) should show string-compatible completions", async () => {
      const { script, position } = helperPos("set $x @projectAddr(", ")");
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of ALL_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
    });

    // Unclosed parens: @projectAddr without closing ")"
    it("@projectAddr(<cursor> (no closing paren) should still show string-compatible completions", async () => {
      const script = `${GIVETH}set $x @projectAddr(`;
      const position = { line: 2, col: "set $x @projectAddr(".length };
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of ALL_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
    });
  });
});
