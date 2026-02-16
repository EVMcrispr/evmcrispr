import "../setup";
import { beforeAll, describe, it } from "bun:test";

import type { CompletionItem, CompletionItemKind } from "@evmcrispr/sdk";
import { EVMcrispr, expect, getPublicClient } from "@evmcrispr/test-utils";
import type { PublicClient } from "viem";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const _labels = (items: CompletionItem[]): string[] =>
  items.map((i) => i.label);

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

describe("Completions – ens commands", () => {
  let evm: EVMcrispr;
  const ENS = "load ens\n";

  beforeAll(() => {
    const client = getPublicClient();
    evm = new EVMcrispr(client as PublicClient);
  });

  // -------------------------------------------------------------------------
  // renew
  // -------------------------------------------------------------------------

  describe("renew", () => {
    it("renew <cursor> should show all helpers and variables (any type)", async () => {
      const script = `${ENS}ens:renew `;
      const items = await evm.getCompletions(script, pos(script, 2));
      // "any" type shows all helpers
      expect(hasLabel(items, "@me")).to.be.true;
      expect(hasLabel(items, "@date")).to.be.true;
      // Module-specific helper @contenthash should be available
      expect(hasLabel(items, "@contenthash")).to.be.true;
    });

    it("renew $domains <cursor> should show all helpers and variables (any type)", async () => {
      const script = `${ENS}ens:renew $domains `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "@me")).to.be.true;
      expect(hasLabel(items, "@date")).to.be.true;
    });
  });

  // -------------------------------------------------------------------------
  // Cross-cutting: ens helper visibility
  // -------------------------------------------------------------------------

  describe("ens helpers", () => {
    it("@contenthash should appear in completions after loading ens module", async () => {
      const script = `${ENS}set $x `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const helperItems = onlyKind(items, "helper");
      expect(hasLabel(helperItems, "@contenthash")).to.be.true;
    });
  });
});

// ---------------------------------------------------------------------------
// Helper completions
// ---------------------------------------------------------------------------

describe("Completions – ens helpers", () => {
  let evm: EVMcrispr;

  beforeAll(() => {
    const client = getPublicClient();
    evm = new EVMcrispr(client as PublicClient);
  });

  // All 12 std helpers + 1 ens helper = 13
  const ALL_HELPERS = [
    "@abi.encodeCall",
    "@contenthash",
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

  // Bytes32-returning helpers (std 3 + ens 1)
  const BYTES32_HELPERS = ["@contenthash", "@get", "@id", "@namehash"];

  const NUMBER_HELPERS = ["@date", "@get", "@token.amount", "@token.balance"];

  const ENS = "load ens\n";

  // -------------------------------------------------------------------------
  // Helpers as suggestions – type filtering
  // -------------------------------------------------------------------------

  describe("helpers as suggestions", () => {
    it('set $x <cursor> (type "any") should show all 13 helpers', async () => {
      const script = `${ENS}set $x `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const helperItems = onlyKind(items, "helper");
      for (const h of ALL_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(helperItems).to.have.lengthOf(ALL_HELPERS.length);
    });

    it("exec $c f(bytes32) <cursor> should include @contenthash", async () => {
      const script = `${ENS}exec $c f(bytes32) `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const helperItems = onlyKind(items, "helper");
      for (const h of BYTES32_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(hasLabel(helperItems, "@me")).to.be.false;
      expect(hasLabel(helperItems, "@date")).to.be.false;
    });

    it("exec <cursor> (address context) should NOT include @contenthash", async () => {
      const script = `${ENS}set $c 0x0000000000000000000000000000000000000001\nexec `;
      const items = await evm.getCompletions(script, pos(script, 3));
      const helperItems = onlyKind(items, "helper");
      for (const h of ADDRESS_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(hasLabel(helperItems, "@contenthash")).to.be.false;
    });

    it("exec $c f(uint256) <cursor> (number context) should NOT include @contenthash", async () => {
      const script = `${ENS}exec $c f(uint256) `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const helperItems = onlyKind(items, "helper");
      for (const h of NUMBER_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(hasLabel(helperItems, "@contenthash")).to.be.false;
    });
  });

  // -------------------------------------------------------------------------
  // Snippet metadata
  // -------------------------------------------------------------------------

  describe("snippet metadata", () => {
    it("@contenthash should have isSnippet = true and insertText with ($0)", async () => {
      const script = `${ENS}print `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const contenthash = items.find((i) => i.label === "@contenthash");
      expect(contenthash).to.exist;
      expect(contenthash!.isSnippet).to.be.true;
      expect(contenthash!.insertText).to.equal("@contenthash($0)");
    });
  });

  // -------------------------------------------------------------------------
  // Helper argument completions
  // -------------------------------------------------------------------------

  describe("helper argument completions", () => {
    /**
     * Place the cursor inside a helper's parentheses on line 2
     * (after the "load ens" prefix on line 1).
     */
    const helperPos = (before: string, after: string) => ({
      script: `${ENS}${before}${after}`,
      position: { line: 2, col: before.length },
    });

    // @contenthash(string) -> all helpers (string accepts all)
    it("@contenthash(<cursor>) should show string-compatible completions", async () => {
      const { script, position } = helperPos("set $x @contenthash(", ")");
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of ALL_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
    });

    // Unclosed parens: @contenthash without closing ")"
    it("@contenthash(<cursor> (no closing paren) should still show string-compatible completions", async () => {
      const script = `${ENS}set $x @contenthash(`;
      const position = { line: 2, col: "set $x @contenthash(".length };
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of ALL_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
    });
  });
});
