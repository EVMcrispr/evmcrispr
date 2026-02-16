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
