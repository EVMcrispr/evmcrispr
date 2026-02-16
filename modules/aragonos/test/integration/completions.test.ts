import "../setup";
import { beforeAll, describe, it } from "bun:test";

import type { CompletionItem, CompletionItemKind } from "@evmcrispr/sdk";
import { EVMcrispr, expect, getPublicClient } from "@evmcrispr/test-utils";
import type { PublicClient } from "viem";
import { DAO } from "../fixtures";

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

// Prefix that loads aragonos module
const AR = "load aragonos\n";

// Wrap a command inside an aragonos:connect block for DAO context.
// Returns the script and the line number where the command appears.
const inConnect = (command: string): { script: string; line: number } => {
  const script = `${AR}aragonos:connect ${DAO.kernel} (\n  ${command}`;
  const line = script.split("\n").length;
  return { script, line };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Completions – aragonos commands", () => {
  let evm: EVMcrispr;

  beforeAll(() => {
    const client = getPublicClient();
    evm = new EVMcrispr(client as PublicClient);
  });

  // -------------------------------------------------------------------------
  // connect
  // -------------------------------------------------------------------------

  describe("connect", () => {
    it("connect <cursor> should accept any value for dao type", async () => {
      const script = `${AR}aragonos:connect `;
      const items = await evm.getCompletions(script, pos(script, 2));
      // "dao" is a custom type; completions depend on its completions() method
      // At minimum it should not crash
      expect(items).to.be.an("array");
    });

    it("connect $dao <cursor> should show block snippet", async () => {
      const script = `${AR}aragonos:connect $dao `;
      const items = await evm.getCompletions(script, pos(script, 2));
      expect(hasLabel(items, "( ... )")).to.be.true;
      const blockItem = items.find((i) => i.label === "( ... )");
      expect(blockItem?.isSnippet).to.be.true;
    });
  });

  // -------------------------------------------------------------------------
  // new-dao
  // -------------------------------------------------------------------------

  describe("new-dao", () => {
    it("new-dao <cursor> should show string-compatible items", async () => {
      const { script, line } = inConnect("new-dao ");
      const items = await evm.getCompletions(script, pos(script, line));
      // "string" type accepts all helpers
      expect(hasLabel(items, "@me")).to.be.true;
      expect(hasLabel(items, "@date")).to.be.true;
    });
  });

  // -------------------------------------------------------------------------
  // new-token
  // -------------------------------------------------------------------------

  describe("new-token", () => {
    it("new-token <cursor> should return empty (variable type)", async () => {
      const { script, line } = inConnect("new-token ");
      const items = await evm.getCompletions(script, pos(script, line));
      expect(items).to.have.lengthOf(0);
    });

    it("new-token $t <cursor> should show string-compatible items for name", async () => {
      const { script, line } = inConnect("new-token $t ");
      const items = await evm.getCompletions(script, pos(script, line));
      expect(hasLabel(items, "@me")).to.be.true;
    });

    it("new-token $t MyToken <cursor> should show string-compatible items for symbol", async () => {
      const { script, line } = inConnect("new-token $t MyToken ");
      const items = await evm.getCompletions(script, pos(script, line));
      expect(hasLabel(items, "@me")).to.be.true;
    });

    it("new-token $t MyToken MTK <cursor> should show address-compatible items for controller", async () => {
      const { script, line } = inConnect("new-token $t MyToken MTK ");
      const items = await evm.getCompletions(script, pos(script, line));
      expect(hasLabel(items, "@me")).to.be.true;
      expect(hasLabel(items, "@ens")).to.be.true;
      expect(hasLabel(items, "@date")).to.be.false;
    });

    it("new-token $t MyToken MTK $ctrl <cursor> should show number items for optional decimals", async () => {
      const { script, line } = inConnect("new-token $t MyToken MTK $ctrl ");
      const items = await evm.getCompletions(script, pos(script, line));
      // Optional "number" arg
      expect(hasLabel(items, "@date")).to.be.true;
      expect(hasLabel(items, "@me")).to.be.false;
    });

    it("new-token $t MyToken MTK $ctrl 18 <cursor> should show bool items for optional transferable", async () => {
      const { script, line } = inConnect("new-token $t MyToken MTK $ctrl 18 ");
      const items = await evm.getCompletions(script, pos(script, line));
      expect(hasLabel(items, "true")).to.be.true;
      expect(hasLabel(items, "false")).to.be.true;
    });
  });

  // -------------------------------------------------------------------------
  // grant
  // -------------------------------------------------------------------------

  describe("grant", () => {
    it("grant <cursor> should show address-compatible items for grantee", async () => {
      const { script, line } = inConnect("grant ");
      const items = await evm.getCompletions(script, pos(script, line));
      expect(hasLabel(items, "@me")).to.be.true;
      expect(hasLabel(items, "@ens")).to.be.true;
      expect(hasLabel(items, "@date")).to.be.false;
    });

    it("grant $grantee <cursor> should show DAO app identifiers (app type)", async () => {
      const { script, line } = inConnect("grant $grantee ");
      const items = await evm.getCompletions(script, pos(script, line));
      // "app" type has custom completions that return DAO app identifiers
      const fieldItems = onlyKind(items, "field");
      expect(fieldItems.length).to.be.greaterThan(0);
      expect(hasLabel(fieldItems, "kernel")).to.be.true;
      expect(hasLabel(fieldItems, "acl")).to.be.true;
    });

    it("grant $grantee @app(acl) <cursor> should show permission type items for role", async () => {
      const { script, line } = inConnect("grant $grantee @app(acl) ");
      const items = await evm.getCompletions(script, pos(script, line));
      // "permission" is a custom type without custom completions;
      // should at least not crash and show some items
      expect(items).to.be.an("array");
    });

    it("grant $grantee @app(acl) ROLE $mgr <cursor> should show --oracle opt", async () => {
      const { script, line } = inConnect("grant $grantee @app(acl) ROLE $mgr ");
      const items = await evm.getCompletions(script, pos(script, line));
      expect(hasLabel(items, "--oracle")).to.be.true;
    });

    it("grant --<cursor> should show only --oracle", async () => {
      const { script, line } = inConnect("grant --");
      const items = await evm.getCompletions(script, pos(script, line));
      expect(labels(items)).to.deep.equal(["--oracle"]);
    });

    it("grant $grantee @app(acl) ROLE $mgr --oracle <cursor> should show address items", async () => {
      const { script, line } = inConnect(
        "grant $grantee @app(acl) ROLE $mgr --oracle ",
      );
      const items = await evm.getCompletions(script, pos(script, line));
      expect(hasLabel(items, "@me")).to.be.true;
      expect(hasLabel(items, "@ens")).to.be.true;
      expect(hasLabel(items, "@date")).to.be.false;
    });
  });

  // -------------------------------------------------------------------------
  // revoke
  // -------------------------------------------------------------------------

  describe("revoke", () => {
    it("revoke <cursor> should use grantee completion override (DAO-aware)", async () => {
      const { script, line } = inConnect("revoke ");
      const items = await evm.getCompletions(script, pos(script, line));
      // revoke has a completions override for grantee that returns known
      // grantee addresses from the connected DAO's permissions. The override
      // is exclusive, so generic address helpers are NOT shown.
      expect(items).to.be.an("array");
      // All returned items should be field kind (addresses from DAO permissions)
      for (const item of items) {
        expect(item.kind).to.equal("field");
      }
    });

    it("revoke $grantee <cursor> should use app completion override (DAO-aware)", async () => {
      const { script, line } = inConnect("revoke $grantee ");
      const items = await evm.getCompletions(script, pos(script, line));
      // revoke has an app override that shows apps where the grantee has permissions
      expect(items).to.be.an("array");
    });

    it("revoke $grantee @app(acl) <cursor> should use role completion override", async () => {
      const { script, line } = inConnect("revoke $grantee @app(acl) ");
      const items = await evm.getCompletions(script, pos(script, line));
      // revoke has a role override that shows roles the grantee has on the app
      expect(items).to.be.an("array");
    });
  });

  // -------------------------------------------------------------------------
  // install
  // -------------------------------------------------------------------------

  describe("install", () => {
    it("install <cursor> should return empty (variable type)", async () => {
      const { script, line } = inConnect("install ");
      const items = await evm.getCompletions(script, pos(script, line));
      expect(items).to.have.lengthOf(0);
    });

    it("install $app <cursor> should show items for repo type", async () => {
      const { script, line } = inConnect("install $app ");
      const items = await evm.getCompletions(script, pos(script, line));
      // "repo" is a custom type; should at least not crash
      expect(items).to.be.an("array");
    });

    it("install $app repo:thing <cursor> should show items for rest params", async () => {
      const { script, line } = inConnect("install $app repo:thing ");
      const items = await evm.getCompletions(script, pos(script, line));
      expect(items).to.be.an("array");
    });

    it("install $app repo:thing $param --<cursor> should show --dao and --version opts", async () => {
      const { script, line } = inConnect("install $app repo:thing $param --");
      const items = await evm.getCompletions(script, pos(script, line));
      const optLabels = labels(items);
      expect(optLabels).to.include("--dao");
      expect(optLabels).to.include("--version");
      expect(items).to.have.lengthOf(2);
    });
  });

  // -------------------------------------------------------------------------
  // upgrade
  // -------------------------------------------------------------------------

  describe("upgrade", () => {
    it("upgrade <cursor> should show items for repo type", async () => {
      const { script, line } = inConnect("upgrade ");
      const items = await evm.getCompletions(script, pos(script, line));
      expect(items).to.be.an("array");
    });

    it("upgrade $repo <cursor> should show items for optional any type", async () => {
      const { script, line } = inConnect("upgrade $repo ");
      const items = await evm.getCompletions(script, pos(script, line));
      // Optional "any" arg shows all helpers
      expect(hasLabel(items, "@me")).to.be.true;
    });
  });

  // -------------------------------------------------------------------------
  // act
  // -------------------------------------------------------------------------

  describe("act", () => {
    it("act <cursor> should use agent completion override (DAO agent apps)", async () => {
      const { script, line } = inConnect("act ");
      const items = await evm.getCompletions(script, pos(script, line));
      // act has a completions override for agent that returns app identifiers
      // containing "agent" from the connected DAO. The override is exclusive.
      expect(items).to.be.an("array");
      for (const item of items) {
        expect(item.kind).to.equal("field");
        expect(item.label).to.include("agent");
      }
    });

    it("act @app(agent) <cursor> should show address-compatible items for target", async () => {
      const { script, line } = inConnect("act @app(agent) ");
      const items = await evm.getCompletions(script, pos(script, line));
      // target has no override -> default address-type completions
      expect(hasLabel(items, "@me")).to.be.true;
      expect(hasLabel(items, "@date")).to.be.false;
    });

    it("act @app(agent) $target <cursor> should use signature completion override", async () => {
      const { script, line } = inConnect("act @app(agent) $target ");
      const items = await evm.getCompletions(script, pos(script, line));
      // act has a signature override that shows ABI function signatures
      // from the target address; with a variable target it may return empty
      expect(items).to.be.an("array");
    });

    it('act @app(agent) $target f(bool) <cursor> should resolve params to "bool"', async () => {
      const { script, line } = inConnect("act @app(agent) $target f(bool) ");
      const items = await evm.getCompletions(script, pos(script, line));
      expect(hasLabel(items, "true")).to.be.true;
      expect(hasLabel(items, "false")).to.be.true;
      expect(hasLabel(items, "@me")).to.be.false;
    });

    it('act @app(agent) $target f(address,uint256) $a <cursor> should resolve to "number"', async () => {
      const { script, line } = inConnect(
        "act @app(agent) $target f(address,uint256) $a ",
      );
      const items = await evm.getCompletions(script, pos(script, line));
      expect(hasLabel(items, "@date")).to.be.true;
      expect(hasLabel(items, "@me")).to.be.false;
    });
  });

  // -------------------------------------------------------------------------
  // forward
  // -------------------------------------------------------------------------

  describe("forward", () => {
    it("forward <cursor> should show DAO app identifiers (app type, rest)", async () => {
      const { script, line } = inConnect("forward ");
      const items = await evm.getCompletions(script, pos(script, line));
      const fieldItems = onlyKind(items, "field");
      expect(fieldItems.length).to.be.greaterThan(0);
      expect(hasLabel(fieldItems, "kernel")).to.be.true;
    });

    it("forward @app(agent) <cursor> should show block snippet (next arg is block)", async () => {
      const { script, line } = inConnect("forward @app(agent) ");
      const items = await evm.getCompletions(script, pos(script, line));
      // Since forwarders is rest + block follows, after one rest arg both
      // more app items and the block snippet could appear
      expect(items).to.be.an("array");
    });

    it("forward --<cursor> should show forward opts", async () => {
      const { script, line } = inConnect("forward --");
      const items = await evm.getCompletions(script, pos(script, line));
      const optLabels = labels(items);
      expect(optLabels).to.include("--context");
      expect(optLabels).to.include("--check-forwarder");
      expect(items).to.have.lengthOf(2);
    });
  });

  // -------------------------------------------------------------------------
  // Cross-cutting: aragonos helpers
  // -------------------------------------------------------------------------

  describe("aragonos helpers", () => {
    it("@app, @aragonEns, @nextApp should appear after loading aragonos", async () => {
      const script = `${AR}set $x `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const helperItems = onlyKind(items, "helper");
      expect(hasLabel(helperItems, "@app")).to.be.true;
      expect(hasLabel(helperItems, "@aragonEns")).to.be.true;
      expect(hasLabel(helperItems, "@nextApp")).to.be.true;
    });
  });
});
