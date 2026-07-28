import "../setup";
import { beforeAll, describe, it } from "bun:test";
import {
  constants as stdConstants,
  helpers as stdHelpers,
} from "@evmcrispr/module-std";
import type { CompletionItem, CompletionItemKind } from "@evmcrispr/sdk";
import { expect, helperLabels } from "@evmcrispr/test-utils";
import { type EvmlWorkspace, evml } from "@evmcrispr/test-utils/evml";
import { helpers as givethHelpers } from "../../src/_generated";

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
  let evm: EvmlWorkspace;
  const GIVETH = "load giveth\n";

  beforeAll(() => {
    evm = evml.workspace();
  });

  // -------------------------------------------------------------------------
  // donate
  // -------------------------------------------------------------------------

  describe("donate", () => {
    it("donate <cursor> should show number-compatible items for amount", async () => {
      const script = `${GIVETH}giveth:donate `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "@date")).to.be.true;
      expect(hasLabel(items, "@token.amount")).to.be.true;
      // Should NOT include address-returning helpers
      expect(hasLabel(items, "@me")).to.be.false;
    });

    it("donate 100 <cursor> should show address-compatible items for token", async () => {
      const script = `${GIVETH}giveth:donate 100 `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "@me")).to.be.true;
      expect(hasLabel(items, "@ens")).to.be.true;
      // Should NOT include number-only helpers
      expect(hasLabel(items, "@date")).to.be.false;
    });

    it("donate 100 $token <cursor> should suggest the `to` keyword", async () => {
      const script = `${GIVETH}giveth:donate 100 $token `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "to")).to.be.true;
    });

    it("donate 100 $token to <cursor> should suggest project slugs", async () => {
      const script = `${GIVETH}giveth:donate 100 $token to `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "evmcrispr")).to.be.true;
      const project = items.find((i) => i.label === "wayback-machine");
      expect(project).to.exist;
      expect(project!.detail).to.equal("wayback machine");
    });

    it("donate [100 50] $token to [<cursor> should suggest slugs inside the array", async () => {
      const before = "giveth:donate [100 50] $token to [";
      const script = `${GIVETH}${before}]`;
      const items = await evm.getCompletions(script, {
        line: 2,
        col: before.length,
      });
      expect(hasLabel(items, "evmcrispr")).to.be.true;
      expect(hasLabel(items, "wayback-machine")).to.be.true;
    });

    it("donate 100 $token to evmcrispr --<cursor> should show the opts", async () => {
      const script = `${GIVETH}giveth:donate 100 $token to evmcrispr --`;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(labels(items).sort()).to.deep.equal([
        "--anonymous",
        "--no-approve",
        "--tip",
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // boost / donate-recurring — project slug completions
  // -------------------------------------------------------------------------

  describe("boost", () => {
    it("boost [<cursor> should suggest project slugs inside the array", async () => {
      const before = "giveth:boost [";
      const script = `${GIVETH}${before}]`;
      const items = await evm.getCompletions(script, {
        line: 2,
        col: before.length,
      });
      expect(hasLabel(items, "evmcrispr")).to.be.true;
      expect(hasLabel(items, "gnosis-only-project")).to.be.true;
    });
  });

  describe("donate-recurring", () => {
    it("donate-recurring 100e18/mo $token total to <cursor> should suggest project slugs", async () => {
      const script = `${GIVETH}giveth:donate-recurring 100e18/mo $token total to `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "evmcrispr")).to.be.true;
    });
  });

  // -------------------------------------------------------------------------
  // stake / unstake
  // -------------------------------------------------------------------------

  describe("stake", () => {
    it("stake <cursor> should show number-compatible items for amount", async () => {
      const script = `${GIVETH}giveth:stake `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "@token.amount")).to.be.true;
      expect(hasLabel(items, "@me")).to.be.false;
    });

    it("stake 100 --<cursor> should show only --no-approve", async () => {
      const script = `${GIVETH}giveth:stake 100 --`;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(labels(items)).to.deep.equal(["--no-approve"]);
    });
  });

  describe("unstake", () => {
    it("unstake <cursor> should suggest the `max` keyword", async () => {
      const script = `${GIVETH}giveth:unstake `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "max")).to.be.true;
    });
  });

  // -------------------------------------------------------------------------
  // lock / unlock
  // -------------------------------------------------------------------------

  describe("lock", () => {
    it("lock <cursor> should show number-compatible items for amount", async () => {
      const script = `${GIVETH}giveth:lock `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "@token.amount")).to.be.true;
      expect(hasLabel(items, "@me")).to.be.false;
    });

    it("lock 100 <cursor> should show number-compatible items for rounds", async () => {
      const script = `${GIVETH}giveth:lock 100 `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "@date")).to.be.true;
      expect(hasLabel(items, "@me")).to.be.false;
    });
  });

  describe("unlock", () => {
    it("unlock <cursor> should show number-compatible items for round", async () => {
      const script = `${GIVETH}giveth:unlock `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "@giveth:round")).to.be.true;
      expect(hasLabel(items, "@me")).to.be.false;
    });

    it("unlock 117 <cursor> should show address-compatible items for accounts", async () => {
      const script = `${GIVETH}giveth:unlock 117 `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "@me")).to.be.true;
      expect(hasLabel(items, "@date")).to.be.false;
    });
  });

  // -------------------------------------------------------------------------
  // Cross-cutting: giveth helper visibility
  // -------------------------------------------------------------------------

  describe("giveth helpers", () => {
    it("@giveth:project should appear qualified after a plain load", async () => {
      const script = `${GIVETH}set $x `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const helperItems = onlyKind(items, "helper");
      expect(hasLabel(helperItems, "@giveth:project")).to.be.true;
      // Unqualified spelling requires an import list
      expect(hasLabel(helperItems, "@project")).to.be.false;
    });

    it("@project should appear unqualified when imported", async () => {
      const script = `load giveth [@project]\nset $x `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const helperItems = onlyKind(items, "helper");
      expect(hasLabel(helperItems, "@project")).to.be.true;
    });
  });
});

// ---------------------------------------------------------------------------
// Helper completions
// ---------------------------------------------------------------------------

describe("Completions – giveth helpers", () => {
  let evm: EvmlWorkspace;

  beforeAll(() => {
    evm = evml.workspace();
  });

  // A loaded module offers its helpers qualified; the import list adds the
  // unqualified spelling on top. Expected labels derive from each module's
  // codegen data — adding a helper never requires updating a hand list.
  const std = helperLabels(stdHelpers, { constants: stdConstants });
  const gvQualified = helperLabels(givethHelpers, { module: "giveth" });
  const gvUnqualified = helperLabels(givethHelpers);
  const ALL_HELPERS = [
    ...std.all,
    ...gvQualified.all,
    ...gvUnqualified.all,
  ].sort();
  const ADDRESS_HELPERS = [
    ...std.address,
    ...gvQualified.address,
    ...gvUnqualified.address,
  ].sort();
  const NUMBER_HELPERS = [
    ...std.number,
    ...gvQualified.number,
    ...gvUnqualified.number,
  ].sort();

  // Import every giveth helper so the unqualified spellings exist.
  const GIVETH = `load giveth [${Object.keys(givethHelpers)
    .map((n) => `@${n}`)
    .join(" ")}]\n`;

  // -------------------------------------------------------------------------
  // Helpers as suggestions – type filtering
  // -------------------------------------------------------------------------

  describe("helpers as suggestions", () => {
    it('set $x <cursor> (type "any") should show all helpers', async () => {
      const script = `${GIVETH}set $x `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const helperItems = onlyKind(items, "helper");
      for (const h of ALL_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(helperItems).to.have.lengthOf(ALL_HELPERS.length);
    });

    it("exec <cursor> (address context) should include @project", async () => {
      const script = `${GIVETH}set $c 0x0000000000000000000000000000000000000001\nexec `;
      const items = await evm.getCompletions(script, pos(script, 3));
      const helperItems = onlyKind(items, "helper");
      for (const h of ADDRESS_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(hasLabel(helperItems, "@date")).to.be.false;
      expect(hasLabel(helperItems, "@hash")).to.be.false;
    });

    it("exec $c f(uint256) <cursor> (number context) should NOT include @project", async () => {
      const script = `${GIVETH}exec $c f(uint256) `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const helperItems = onlyKind(items, "helper");
      for (const h of NUMBER_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(hasLabel(helperItems, "@project")).to.be.false;
    });
  });

  // -------------------------------------------------------------------------
  // Snippet metadata
  // -------------------------------------------------------------------------

  describe("snippet metadata", () => {
    it("@project should have isSnippet = true and insertText with ($0)", async () => {
      const script = `${GIVETH}print `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const project = items.find((i: CompletionItem) => i.label === "@project");
      expect(project).to.exist;
      expect(project!.isSnippet).to.be.true;
      expect(project!.insertText).to.equal("@project($0)");
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

    // @project(giveth-project) -> top project slugs fetched from the API
    it("@project(<cursor>) should suggest project slugs", async () => {
      const { script, position } = helperPos("set $x @project(", ")");
      const items = await evm.getCompletions(script, position);
      const fields = onlyKind(items, "field");
      expect(hasLabel(fields, "evmcrispr")).to.be.true;
      expect(hasLabel(fields, "wayback-machine")).to.be.true;
      // The slug slot is typed, so untyped helpers are no longer offered
      expect(onlyKind(items, "helper")).to.have.lengthOf(0);
    });

    // Unclosed parens: @project without closing ")"
    it("@project(<cursor> (no closing paren) should still suggest project slugs", async () => {
      const script = `${GIVETH}set $x @project(`;
      const position = { line: 2, col: "set $x @project(".length };
      const items = await evm.getCompletions(script, position);
      const fields = onlyKind(items, "field");
      expect(hasLabel(fields, "evmcrispr")).to.be.true;
    });
  });
});
