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
    it("new-dao <cursor> should return empty (variable type)", async () => {
      const { script, line } = inConnect("new-dao ");
      const items = await evm.getCompletions(script, pos(script, line));
      expect(items).to.have.lengthOf(0);
    });

    it("new-dao $dao <cursor> should show string-compatible items for daoName", async () => {
      const { script, line } = inConnect("new-dao $dao ");
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
  // exec (ABI-based signature completions via chainId:addr binding)
  // -------------------------------------------------------------------------

  describe("exec / act (ABI binding lookup via chainId:addr)", () => {
    it("std:exec <known-app-address> <cursor> should show ABI function signatures", async () => {
      // Use a known DAO app address; the dao type resolver populates ABI
      // bindings keyed by chainId:address.
      const { script, line } = inConnect(`std:exec ${DAO.acl} `);
      const items = await evm.getCompletions(script, pos(script, line));
      const fieldItems = onlyKind(items, "field");
      expect(fieldItems.length).to.be.greaterThan(0);
      for (const item of fieldItems) {
        expect(item.kind).to.equal("field");
      }
    });

    it("std:exec <known-app-address> <cursor> should include recognized ACL functions", async () => {
      const { script, line } = inConnect(`std:exec ${DAO.acl} `);
      const items = await evm.getCompletions(script, pos(script, line));
      const fieldItems = onlyKind(items, "field");
      const fnLabels = labels(fieldItems);
      expect(fnLabels.some((l) => l.startsWith("createPermission"))).to.be.true;
      expect(fnLabels.some((l) => l.startsWith("grantPermission"))).to.be.true;
    });

    it("std:exec $unknownVar <cursor> should return empty (unresolvable target)", async () => {
      const { script, line } = inConnect("std:exec $unknownVar ");
      const items = await evm.getCompletions(script, pos(script, line));
      expect(items).to.be.an("array");
      expect(onlyKind(items, "field")).to.have.lengthOf(0);
    });

    it("act <agent> <known-app-address> <cursor> should show ABI function signatures", async () => {
      const { script, line } = inConnect(`act ${DAO.agent} ${DAO.acl} `);
      const items = await evm.getCompletions(script, pos(script, line));
      const fieldItems = onlyKind(items, "field");
      expect(fieldItems.length).to.be.greaterThan(0);
      expect(labels(fieldItems).some((l) => l.startsWith("createPermission")))
        .to.be.true;
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

// ---------------------------------------------------------------------------
// Helper completions
// ---------------------------------------------------------------------------

describe("Completions – aragonos helpers", () => {
  let evm: EVMcrispr;

  beforeAll(() => {
    const client = getPublicClient();
    evm = new EVMcrispr(client as PublicClient);
  });

  // All 12 std helpers + 3 aragonos helpers = 15
  const ALL_HELPERS = [
    "@abi.encodeCall",
    "@app",
    "@aragonEns",
    "@date",
    "@ens",
    "@get",
    "@id",
    "@ipfs",
    "@me",
    "@namehash",
    "@nextApp",
    "@nextContract",
    "@token",
    "@token.amount",
    "@token.balance",
  ];

  // Address-returning helpers (std 5 + aragonos 3)
  const ADDRESS_HELPERS = [
    "@app",
    "@aragonEns",
    "@ens",
    "@get",
    "@me",
    "@nextApp",
    "@nextContract",
    "@token",
  ];

  const NUMBER_HELPERS = ["@date", "@get", "@token.amount", "@token.balance"];
  const BYTES32_HELPERS = ["@get", "@id", "@namehash"];

  // Prefix that loads aragonos module
  const AR = "load aragonos\n";

  // -------------------------------------------------------------------------
  // Helpers as suggestions – type filtering
  // -------------------------------------------------------------------------

  describe("helpers as suggestions", () => {
    it('set $x <cursor> (type "any") should show all 15 helpers', async () => {
      const script = `${AR}set $x `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const helperItems = onlyKind(items, "helper");
      for (const h of ALL_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(helperItems).to.have.lengthOf(ALL_HELPERS.length);
    });

    it("exec <cursor> (address context) should include aragonos address helpers", async () => {
      const script = `${AR}set $c 0x0000000000000000000000000000000000000001\nexec `;
      const items = await evm.getCompletions(script, pos(script, 3));
      const helperItems = onlyKind(items, "helper");
      for (const h of ADDRESS_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(hasLabel(helperItems, "@date")).to.be.false;
      expect(hasLabel(helperItems, "@id")).to.be.false;
    });

    it("exec $c f(uint256) <cursor> (number context) should NOT include aragonos helpers", async () => {
      const script = `${AR}exec $c f(uint256) `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const helperItems = onlyKind(items, "helper");
      for (const h of NUMBER_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(hasLabel(helperItems, "@app")).to.be.false;
      expect(hasLabel(helperItems, "@aragonEns")).to.be.false;
      expect(hasLabel(helperItems, "@nextApp")).to.be.false;
    });

    it("exec $c f(bytes32) <cursor> should NOT include aragonos helpers", async () => {
      const script = `${AR}exec $c f(bytes32) `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const helperItems = onlyKind(items, "helper");
      for (const h of BYTES32_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(hasLabel(helperItems, "@app")).to.be.false;
      expect(hasLabel(helperItems, "@aragonEns")).to.be.false;
      expect(hasLabel(helperItems, "@nextApp")).to.be.false;
    });
  });

  // -------------------------------------------------------------------------
  // Snippet metadata
  // -------------------------------------------------------------------------

  describe("snippet metadata", () => {
    it("@app should have isSnippet = true and insertText with ($0)", async () => {
      const script = `${AR}print `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const app = items.find((i) => i.label === "@app");
      expect(app).to.exist;
      expect(app!.isSnippet).to.be.true;
      expect(app!.insertText).to.equal("@app($0)");
    });

    it("@aragonEns should have isSnippet = true and insertText with ($0)", async () => {
      const script = `${AR}print `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const aragonEns = items.find((i) => i.label === "@aragonEns");
      expect(aragonEns).to.exist;
      expect(aragonEns!.isSnippet).to.be.true;
      expect(aragonEns!.insertText).to.equal("@aragonEns($0)");
    });

    it("@nextApp should have isSnippet = true and insertText with ($0)", async () => {
      const script = `${AR}print `;
      const items = await evm.getCompletions(script, pos(script, 2));
      const nextApp = items.find((i) => i.label === "@nextApp");
      expect(nextApp).to.exist;
      expect(nextApp!.isSnippet).to.be.true;
      expect(nextApp!.insertText).to.equal("@nextApp($0)");
    });
  });

  // -------------------------------------------------------------------------
  // Helper argument completions
  // -------------------------------------------------------------------------

  describe("helper argument completions", () => {
    /**
     * Place the cursor inside a helper's parentheses on line 2
     * (after the "load aragonos" prefix on line 1).
     */
    const helperPos = (before: string, after: string) => ({
      script: `${AR}${before}${after}`,
      position: { line: 2, col: before.length },
    });

    // @app(string) -> all helpers (string accepts all)
    it("@app(<cursor>) should show string-compatible completions", async () => {
      const { script, position } = helperPos("set $x @app(", ")");
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of ALL_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
    });

    // @aragonEns(string, any?) -> first arg: string (all helpers)
    it("@aragonEns(<cursor>) first arg should show string-compatible completions", async () => {
      const { script, position } = helperPos("set $x @aragonEns(", ")");
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of ALL_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
    });

    // @aragonEns(string, any?) -> second arg: any (all helpers)
    it("@aragonEns(name, <cursor>) second arg should show any-compatible completions", async () => {
      const { script, position } = helperPos("set $x @aragonEns(name, ", ")");
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of ALL_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
    });

    // @nextApp(number?) -> number-compatible helpers only
    it("@nextApp(<cursor>) should show number-compatible completions", async () => {
      const { script, position } = helperPos("set $x @nextApp(", ")");
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of NUMBER_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(hasLabel(helperItems, "@me")).to.be.false;
      expect(hasLabel(helperItems, "@app")).to.be.false;
      expect(hasLabel(helperItems, "@aragonEns")).to.be.false;
    });

    // Unclosed parens: @app without closing ")"
    it("@app(<cursor> (no closing paren) should still show string-compatible completions", async () => {
      const script = `${AR}set $x @app(`;
      const position = { line: 2, col: "set $x @app(".length };
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of ALL_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
    });

    // Unclosed parens: @nextApp without closing ")"
    it("@nextApp(<cursor> (no closing paren) should still show number-compatible completions", async () => {
      const script = `${AR}set $x @nextApp(`;
      const position = { line: 2, col: "set $x @nextApp(".length };
      const items = await evm.getCompletions(script, position);
      const helperItems = onlyKind(items, "helper");
      for (const h of NUMBER_HELPERS) {
        expect(hasLabel(helperItems, h)).to.be.true;
      }
      expect(hasLabel(helperItems, "@me")).to.be.false;
    });
  });
});
