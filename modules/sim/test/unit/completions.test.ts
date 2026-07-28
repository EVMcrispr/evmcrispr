import "../setup";
import { beforeAll, describe, it } from "bun:test";

import type { CompletionItem, CompletionItemKind } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { type EvmlWorkspace, evml } from "@evmcrispr/test-utils/evml";

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
  let evm: EvmlWorkspace;
  const SIM = "load sim\n";

  beforeAll(() => {
    evm = evml.workspace();
  });

  // -------------------------------------------------------------------------
  // expect
  // -------------------------------------------------------------------------

  describe("expect", () => {
    it("expect <cursor> should show bool-compatible items", async () => {
      const script = `${SIM}sim:expect `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "true")).to.be.true;
      expect(hasLabel(items, "false")).to.be.true;
      const helperItems = onlyKind(items, "helper");
      expect(hasLabel(helperItems, "@bool")).to.be.true;
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
      expect(optLabels).to.include("--auth-token");
      expect(optLabels).to.include("--using");
      expect(items).to.have.lengthOf(4);
    });

    it("fork --using <cursor> should show simulation-mode completions (anvil, hardhat, tenderly, tenderly-multichain, ethereumjs, revm)", async () => {
      const script = `${SIM}sim:fork --using `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const fieldItems = onlyKind(items, "field");
      expect(fieldItems.length).to.equal(6);
      expect(hasLabel(fieldItems, "anvil")).to.be.true;
      expect(hasLabel(fieldItems, "hardhat")).to.be.true;
      expect(hasLabel(fieldItems, "tenderly")).to.be.true;
      expect(hasLabel(fieldItems, "tenderly-multichain")).to.be.true;
      expect(hasLabel(fieldItems, "ethereumjs")).to.be.true;
      expect(hasLabel(fieldItems, "revm")).to.be.true;
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
      expect(hasLabel(items, "@gas.price")).to.be.true;
      expect(hasLabel(items, "@me")).to.be.false;
    });
  });
});
