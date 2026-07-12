import "../setup";

import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";

import { getRenameEdits, prepareRename } from "../../src";

const SCRIPT = `load aragonos [connect grant @app]
connect mydao (
  grant @app(voting) @app(agent) ROLE
)`;

describe("Rename > imported names", () => {
  it("prepares a rename on an unqualified command usage", () => {
    const r = prepareRename(SCRIPT, { line: 3, col: 3 });
    expect(r).to.deep.equal({
      line: 3,
      startCol: 2,
      endCol: 7,
      text: "grant",
    });
  });

  it("rejects positions that are not imported names", () => {
    // `mydao` argument
    expect(prepareRename(SCRIPT, { line: 2, col: 9 })).to.equal(null);
    // std command
    expect(prepareRename("set $a 1", { line: 1, col: 1 })).to.equal(null);
  });

  it("renames a command: rewrites the import entry and usages", () => {
    const r = getRenameEdits(SCRIPT, { line: 3, col: 3 }, "g");
    expect(r).to.deep.equal({
      edits: [
        { line: 1, startCol: 23, endCol: 28, newText: "grant>g" },
        { line: 3, startCol: 2, endCol: 7, newText: "g" },
      ],
    });
  });

  it("renames a helper from its import-list entry", () => {
    const r = getRenameEdits(SCRIPT, { line: 1, col: 30 }, "@a");
    expect(r).to.deep.equal({
      edits: [
        { line: 1, startCol: 29, endCol: 33, newText: "@app>@a" },
        { line: 3, startCol: 9, endCol: 12, newText: "a" },
        { line: 3, startCol: 22, endCol: 25, newText: "a" },
      ],
    });
  });

  it("updates an existing rename instead of stacking", () => {
    const script = "load aragonos [grant>g]\ng @me @me ROLE";
    const r = getRenameEdits(script, { line: 2, col: 0 }, "gr");
    expect(r).to.deep.equal({
      edits: [
        { line: 1, startCol: 15, endCol: 22, newText: "grant>gr" },
        { line: 2, startCol: 0, endCol: 1, newText: "gr" },
      ],
    });
  });

  it("drops the rename suffix when renaming back to the source name", () => {
    const script = "load aragonos [grant>g]\ng @me @me ROLE";
    const r = getRenameEdits(script, { line: 2, col: 0 }, "grant");
    expect(r).to.deep.equal({
      edits: [
        { line: 1, startCol: 15, endCol: 22, newText: "grant" },
        { line: 2, startCol: 0, endCol: 1, newText: "grant" },
      ],
    });
  });

  it("rejects collisions with other imports", () => {
    const script = "load aragonos [connect grant]";
    const r = getRenameEdits(script, { line: 1, col: 24 }, "connect");
    expect(r).to.have.property("error");
  });

  it("rejects invalid names", () => {
    const r = getRenameEdits(SCRIPT, { line: 3, col: 3 }, "not a name");
    expect(r).to.have.property("error");
  });

  it("leaves qualified usages untouched", () => {
    const script =
      "load aragonos [grant]\ngrant @me @me ROLE\naragonos:grant @me @me ROLE";
    const r = getRenameEdits(script, { line: 2, col: 0 }, "g");
    expect(r).to.deep.equal({
      edits: [
        { line: 1, startCol: 15, endCol: 20, newText: "grant>g" },
        { line: 2, startCol: 0, endCol: 5, newText: "g" },
      ],
    });
  });
});
