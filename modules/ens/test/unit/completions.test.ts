import "../setup";
import { beforeAll, describe, it } from "bun:test";

import type { CompletionItem, CompletionItemKind } from "@evmcrispr/sdk";
import {
  expect,
  STD_ADDRESS_HELPERS,
  STD_ALL_HELPERS,
  STD_BYTES_HELPERS,
  STD_BYTES32_HELPERS,
  STD_NUMBER_HELPERS,
} from "@evmcrispr/test-utils";
import { type EvmlWorkspace, evml } from "@evmcrispr/test-utils/evml";

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
  let evm: EvmlWorkspace;
  const ENS = "load ens\n";

  beforeAll(() => {
    evm = evml.workspace();
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
      // Module-specific helper @ens:contenthash should be available
      expect(hasLabel(items, "@ens:contenthash")).to.be.true;
    });

    it("renew $domains <cursor> should show all helpers and variables (any type)", async () => {
      const script = `${ENS}ens:renew $domains `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "@me")).to.be.true;
      expect(hasLabel(items, "@date")).to.be.true;
    });
  });

  // -------------------------------------------------------------------------
  // set-fuses – custom `fuse` arg type completions
  // -------------------------------------------------------------------------

  describe("set-fuses", () => {
    it("set-fuses <name> <cursor> should suggest fuse names", async () => {
      const script = `${ENS}ens:set-fuses vault.mydao.eth `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "cannot-unwrap")).to.be.true;
      expect(hasLabel(items, "cannot-transfer")).to.be.true;
      expect(hasLabel(items, "parent-cannot-control")).to.be.true;
    });
  });

  // -------------------------------------------------------------------------
  // Cross-cutting: ens helper visibility
  // -------------------------------------------------------------------------

  describe("ens helpers", () => {
    it("@ens:contenthash should appear in completions after loading ens module", async () => {
      const script = `${ENS}set $x `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const helperItems = onlyKind(items, "helper");
      expect(hasLabel(helperItems, "@ens:contenthash")).to.be.true;
    });
  });
});

// ---------------------------------------------------------------------------
// Helper completions
// ---------------------------------------------------------------------------

describe("Completions – ens helpers", () => {
  let evm: EvmlWorkspace;

  beforeAll(() => {
    evm = evml.workspace();
  });

  const ENS_HELPERS = [
    "@ens:cointype",
    "@ens:cointype.decode",
    "@ens:contenthash",
    "@ens:addr",
    "@ens:available",
    "@ens:avatar",
    "@ens:contenthash.of",
    "@ens:expiry",
    "@ens:fuses",
    "@ens:fuses.decode",
    "@ens:fuses.of",
    "@ens:name",
    "@ens:normalize",
    "@ens:owner",
    "@ens:rentPrice",
    "@ens:resolver",
    "@ens:text",
    "@ens:labelhash",
    "@ens:namehash",
  ];
  const ALL_HELPERS = [...STD_ALL_HELPERS, ...ENS_HELPERS].sort();
  const ADDRESS_HELPERS = STD_ADDRESS_HELPERS;
  const _BYTES32_HELPERS = STD_BYTES32_HELPERS;
  const NUMBER_HELPERS = STD_NUMBER_HELPERS;

  const ENS = "load ens\n";

  // -------------------------------------------------------------------------
  // Helpers as suggestions – type filtering
  // -------------------------------------------------------------------------

  describe("helpers as suggestions", () => {
    it('set $x <cursor> (type "any") should show all helpers', async () => {
      const script = `${ENS}set $x `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const helperItems = onlyKind(items, "helper");
      for (const h of ALL_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(helperItems).to.have.lengthOf(ALL_HELPERS.length);
    });

    it("exec $c f(bytes) <cursor> should include @ens:contenthash", async () => {
      const script = `${ENS}exec $c f(bytes) `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const helperItems = onlyKind(items, "helper");
      const BYTES_HELPERS = [...STD_BYTES_HELPERS, "@ens:contenthash"].sort();
      for (const h of BYTES_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(hasLabel(helperItems, "@me")).to.be.false;
      expect(hasLabel(helperItems, "@date")).to.be.false;
    });

    it("exec <cursor> (address context) should NOT include @ens:contenthash", async () => {
      const script = `${ENS}set $c 0x0000000000000000000000000000000000000001\nexec `;
      const items = await evm.getCompletions(script, pos(script, 3));
      const helperItems = onlyKind(items, "helper");
      for (const h of ADDRESS_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(hasLabel(helperItems, "@ens:contenthash")).to.be.false;
    });

    it("exec $c f(uint256) <cursor> (number context) should NOT include @ens:contenthash", async () => {
      const script = `${ENS}exec $c f(uint256) `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const helperItems = onlyKind(items, "helper");
      for (const h of NUMBER_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(hasLabel(helperItems, "@ens:contenthash")).to.be.false;
    });
  });

  // -------------------------------------------------------------------------
  // Snippet metadata
  // -------------------------------------------------------------------------

  describe("snippet metadata", () => {
    it("@ens:contenthash should have isSnippet = true and insertText with ($0)", async () => {
      const script = `${ENS}print `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const contenthash = items.find(
        (i: CompletionItem) => i.label === "@ens:contenthash",
      );
      expect(contenthash).to.exist;
      expect(contenthash!.isSnippet).to.be.true;
      expect(contenthash!.insertText).to.equal("@ens:contenthash($0)");
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

    // @ens:contenthash(string) -> all helpers (string accepts all)
    it("@ens:contenthash(<cursor>) should show string-compatible completions", async () => {
      const { script, position } = helperPos("set $x @ens:contenthash(", ")");
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of ALL_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
    });

    // Unclosed parens: @ens:contenthash without closing ")"
    it("@ens:contenthash(<cursor> (no closing paren) should still show string-compatible completions", async () => {
      const script = `${ENS}set $x @ens:contenthash(`;
      const position = { line: 2, col: "set $x @ens:contenthash(".length };
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of ALL_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
    });
  });
});
