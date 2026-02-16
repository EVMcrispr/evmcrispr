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
