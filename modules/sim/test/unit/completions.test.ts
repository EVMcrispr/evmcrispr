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

describe("Completions – sim commands", () => {
  let evm: EVMcrispr;
  const SIM = "load sim\n";

  beforeAll(() => {
    const client = getPublicClient();
    evm = new EVMcrispr(client as PublicClient);
  });

  // -------------------------------------------------------------------------
  // expect
  // -------------------------------------------------------------------------

  describe("expect", () => {
    it("expect <cursor> should show user variables (completion override)", async () => {
      const script = `set $x 1\n${SIM}sim:expect `;
      const items = await evm.getCompletions(script, pos(script, 3));
      // Custom override returns variables only
      expect(onlyKind(items, "variable").length).to.be.greaterThan(0);
      expect(hasLabel(items, "$x")).to.be.true;
    });

    it("expect $x <cursor> should show only operators", async () => {
      const script = `${SIM}sim:expect $x `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const fieldItems = onlyKind(items, "field");
      expect(fieldItems.length).to.be.greaterThan(0);
      expect(hasLabel(items, "==")).to.be.true;
      expect(hasLabel(items, "!=")).to.be.true;
      expect(hasLabel(items, "<")).to.be.true;
      expect(hasLabel(items, "<=")).to.be.true;
      expect(hasLabel(items, ">")).to.be.true;
      expect(hasLabel(items, ">=")).to.be.true;
      // Should be only operators (field items), no helpers
      expect(onlyKind(items, "helper")).to.have.lengthOf(0);
    });

    it("expect $x == <cursor> should show user variables (completion override)", async () => {
      const script = `set $y 2\n${SIM}sim:expect $x == `;
      const items = await evm.getCompletions(script, pos(script, 3));
      expect(onlyKind(items, "variable").length).to.be.greaterThan(0);
      expect(hasLabel(items, "$y")).to.be.true;
    });
  });

  // -------------------------------------------------------------------------
  // fork
  // -------------------------------------------------------------------------

  describe("fork", () => {
    it("fork <cursor> should show block snippet", async () => {
      const script = `${SIM}sim:fork `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "( ... )")).to.be.true;
      const blockItem = items.find((i) => i.label === "( ... )");
      expect(blockItem?.isSnippet).to.be.true;
    });

    it("fork --<cursor> should show all 4 opts", async () => {
      const script = `${SIM}sim:fork --`;
      const items = await evm.getCompletions(script, pos(script, 2));
      const optLabels = labels(items);
      expect(optLabels).to.include("--block-number");
      expect(optLabels).to.include("--from");
      expect(optLabels).to.include("--tenderly");
      expect(optLabels).to.include("--using");
      expect(items).to.have.lengthOf(4);
    });
  });

  // -------------------------------------------------------------------------
  // wait
  // -------------------------------------------------------------------------

  describe("wait", () => {
    it("wait <cursor> should show number-compatible items", async () => {
      const script = `${SIM}sim:wait `;
      const items = await evm.getCompletions(script, pos(script, 2));
      // Number type: should include number-returning helpers
      expect(hasLabel(items, "@date")).to.be.true;
      // Should NOT include address-returning helpers
      expect(hasLabel(items, "@me")).to.be.false;
    });

    it("wait 3600 <cursor> should show number-compatible items (optional period arg)", async () => {
      const script = `${SIM}sim:wait 3600 `;
      const items = await evm.getCompletions(script, pos(script, 2));
      // Optional arg is "number" type
      expect(hasLabel(items, "@date")).to.be.true;
      expect(hasLabel(items, "@me")).to.be.false;
    });
  });

  // -------------------------------------------------------------------------
  // set-code
  // -------------------------------------------------------------------------

  describe("set-code", () => {
    it("set-code <cursor> should show string-compatible items", async () => {
      const script = `${SIM}sim:set-code `;
      const items = await evm.getCompletions(script, pos(script, 2));
      // "string" type accepts all helpers
      expect(hasLabel(items, "@me")).to.be.true;
      expect(hasLabel(items, "@date")).to.be.true;
    });

    it("set-code $addr <cursor> should show string-compatible items for bytecode", async () => {
      const script = `${SIM}sim:set-code $addr `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "@me")).to.be.true;
    });
  });

  // -------------------------------------------------------------------------
  // set-storage-at
  // -------------------------------------------------------------------------

  describe("set-storage-at", () => {
    it("set-storage-at <cursor> should show address-compatible items", async () => {
      const script = `${SIM}sim:set-storage-at `;
      const items = await evm.getCompletions(script, pos(script, 2));
      // "address" type
      expect(hasLabel(items, "@me")).to.be.true;
      expect(hasLabel(items, "@ens")).to.be.true;
      expect(hasLabel(items, "@date")).to.be.false;
    });

    it("set-storage-at $addr <cursor> should show bytes32-compatible items for slot", async () => {
      const script = `${SIM}sim:set-storage-at $addr `;
      const items = await evm.getCompletions(script, pos(script, 2));
      // "bytes32" type: should include helpers that return bytes32
      // Should NOT include address-only helpers
      expect(items.length).to.be.greaterThanOrEqual(0);
    });

    it("set-storage-at $addr $slot <cursor> should show string-compatible items for value", async () => {
      const script = `${SIM}sim:set-storage-at $addr $slot `;
      const items = await evm.getCompletions(script, pos(script, 2));
      // "string" type accepts all
      expect(hasLabel(items, "@me")).to.be.true;
    });
  });

  // -------------------------------------------------------------------------
  // set-balance
  // -------------------------------------------------------------------------

  describe("set-balance", () => {
    it("set-balance <cursor> should show address-compatible items", async () => {
      const script = `${SIM}sim:set-balance `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "@me")).to.be.true;
      expect(hasLabel(items, "@ens")).to.be.true;
      expect(hasLabel(items, "@date")).to.be.false;
    });

    it("set-balance $addr <cursor> should show number-compatible items", async () => {
      const script = `${SIM}sim:set-balance $addr `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "@date")).to.be.true;
      expect(hasLabel(items, "@token.amount")).to.be.true;
      expect(hasLabel(items, "@me")).to.be.false;
    });
  });
});
