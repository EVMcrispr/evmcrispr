import "../setup";

import { describe, it } from "bun:test";
import type { ModuleData } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";

import { getAutoImportEdits } from "../../src";

const noop = async () => ({ default: {} }) as any;

const MODULES: Record<string, ModuleData> = {
  std: {
    commands: { set: noop, print: noop, load: noop, exec: noop },
    helpers: { me: noop, get: noop },
    constants: {},
  },
  ens: {
    commands: { renew: noop, register: noop, "set-addr": noop },
    helpers: { addr: noop, namehash: noop, rentPrice: noop },
    constants: {},
  },
  aragonos: {
    commands: { connect: noop, grant: noop, exec: noop },
    helpers: { app: noop },
    constants: { "ANY-ENTITY": "0x..." },
  },
};

const edits = (
  script: string,
  regions?: any[],
  extraModules: Record<string, ModuleData> = {},
) =>
  getAutoImportEdits(
    script,
    (name) => extraModules[name] ?? MODULES[name],
    regions,
  );

describe("Auto-import > qualified name normalization", () => {
  it("rewrites a qualified command and creates the load line", () => {
    expect(edits("ens:renew vitalik.eth 1y")).to.deep.equal([
      { line: 1, startCol: 0, endCol: 9, newText: "renew" },
      { line: 1, startCol: 0, endCol: 0, newText: "load ens [renew]\n" },
    ]);
  });

  it("adds an import list to a bare load line", () => {
    expect(edits("load ens\nens:renew vitalik.eth 1y")).to.deep.equal([
      { line: 2, startCol: 0, endCol: 9, newText: "renew" },
      { line: 1, startCol: 8, endCol: 8, newText: " [renew]" },
    ]);
  });

  it("merges into an existing import list, commands before helpers", () => {
    expect(
      edits("load ens [@addr]\nens:renew vitalik.eth 1y\nprint @addr(a.eth)"),
    ).to.deep.equal([
      { line: 2, startCol: 0, endCol: 9, newText: "renew" },
      { line: 1, startCol: 9, endCol: 16, newText: "[renew @addr]" },
    ]);
  });

  it("rewrites a qualified helper and imports it", () => {
    expect(edits("load ens\nprint @ens:namehash(a.eth)")).to.deep.equal([
      { line: 2, startCol: 6, endCol: 19, newText: "@namehash" },
      { line: 1, startCol: 8, endCol: 8, newText: " [@namehash]" },
    ]);
  });

  it("rewrites to the bound name when the import already exists (renamed)", () => {
    expect(edits("load ens [renew>r]\nens:renew vitalik.eth 1y")).to.deep.equal(
      [{ line: 2, startCol: 0, endCol: 9, newText: "r" }],
    );
  });

  it("does not duplicate an existing import", () => {
    expect(edits("load ens [renew]\nens:renew vitalik.eth 1y")).to.deep.equal([
      { line: 2, startCol: 0, endCol: 9, newText: "renew" },
    ]);
  });

  it("renames on collision with a std export", () => {
    // aragonos:exec vs std exec → act like TS: import under a fresh name
    expect(edits("load aragonos\naragonos:exec a b")).to.deep.equal([
      { line: 2, startCol: 0, endCol: 13, newText: "execAragonos" },
      { line: 1, startCol: 13, endCol: 13, newText: " [exec>execAragonos]" },
    ]);
  });

  it("renames helpers on collision, PascalCasing the module", () => {
    // giveth-like case: @projectAddr already def-defined
    expect(
      edits(
        'def @projectAddr "number" 5\nload giveth\nprint @giveth:projectAddr(1)',
        undefined,
        {
          giveth: {
            commands: {},
            helpers: { projectAddr: async () => ({}) as any },
            constants: {},
          },
        },
      ),
    ).to.deep.equal([
      { line: 3, startCol: 6, endCol: 25, newText: "@projectAddrGiveth" },
      {
        line: 2,
        startCol: 11,
        endCol: 11,
        newText: " [@projectAddr>@projectAddrGiveth]",
      },
    ]);
  });

  it("keeps qualified when even the renamed form is taken", () => {
    expect(
      edits(
        'def exec "$a: string" ( print $a )\ndef execAragonos "$a: string" ( print $a )\nload aragonos\naragonos:exec a b',
      ),
    ).to.deep.equal([]);
  });

  it("reuses the queued rename for repeated tokens in one pass", () => {
    expect(
      edits("load aragonos\naragonos:exec a b\naragonos:exec c d"),
    ).to.deep.equal([
      { line: 2, startCol: 0, endCol: 13, newText: "execAragonos" },
      { line: 3, startCol: 0, endCol: 13, newText: "execAragonos" },
      { line: 1, startCol: 13, endCol: 13, newText: " [exec>execAragonos]" },
    ]);
  });

  it("keeps qualified when another import owns the name", () => {
    expect(
      edits("load ens [renew]\nload aragonos [grant>renew]\nens:renew a 1y"),
    ).to.deep.equal([
      // renew import exists for ens itself → token rewrite only
      { line: 3, startCol: 0, endCol: 9, newText: "renew" },
    ]);
  });

  it("renames on collision with a def-defined name", () => {
    expect(
      edits('def renew "$a: string" ( print $a )\nens:renew a 1y'),
    ).to.deep.equal([
      { line: 2, startCol: 0, endCol: 9, newText: "renewEns" },
      {
        line: 1,
        startCol: 0,
        endCol: 0,
        newText: "load ens [renew>renewEns]\n",
      },
    ]);
  });

  it("PascalCases dashed module names in renames", () => {
    expect(
      edits("load access-control\naccess-control:grant a b c", undefined, {
        "access-control": {
          commands: { grant: async () => ({}) as any },
          helpers: {},
          constants: {},
        },
      }),
    ).to.deep.equal([
      // std has no grant, but aragonos isn't loaded so no clash — name free
      { line: 2, startCol: 0, endCol: 20, newText: "grant" },
      { line: 1, startCol: 19, endCol: 19, newText: " [grant]" },
    ]);
    expect(
      edits(
        'def grant "$a: string" ( print $a )\nload access-control\naccess-control:grant a b c',
        undefined,
        {
          "access-control": {
            commands: { grant: async () => ({}) as any },
            helpers: {},
            constants: {},
          },
        },
      ),
    ).to.deep.equal([
      { line: 3, startCol: 0, endCol: 20, newText: "grantAccessControl" },
      {
        line: 2,
        startCol: 19,
        endCol: 19,
        newText: " [grant>grantAccessControl]",
      },
    ]);
  });

  it("skips unknown exports and unknown modules", () => {
    expect(edits("ens:nope a")).to.deep.equal([]);
    expect(edits("wat:renew a")).to.deep.equal([]);
  });

  it("strips a redundant std prefix without touching imports", () => {
    expect(edits("std:print hola")).to.deep.equal([
      { line: 1, startCol: 0, endCol: 9, newText: "print" },
    ]);
  });

  it("groups multiple names into one list edit", () => {
    expect(
      edits("load ens\nens:renew a 1y\nprint @ens:addr(a.eth)"),
    ).to.deep.equal([
      { line: 2, startCol: 0, endCol: 9, newText: "renew" },
      { line: 3, startCol: 6, endCol: 15, newText: "@addr" },
      { line: 1, startCol: 8, endCol: 8, newText: " [renew @addr]" },
    ]);
  });

  it("imports constants like helpers", () => {
    expect(edits("load aragonos\nprint @aragonos:ANY-ENTITY")).to.deep.equal([
      { line: 2, startCol: 6, endCol: 26, newText: "@ANY-ENTITY" },
      { line: 1, startCol: 13, endCol: 13, newText: " [@ANY-ENTITY]" },
    ]);
  });

  it("only touches tokens inside the given regions", () => {
    const script = "load ens\nens:renew a 1y\nens:register b";
    const onlyLine3 = [{ startLine: 3, startCol: 0, endLine: 3, endCol: 14 }];
    expect(edits(script, onlyLine3)).to.deep.equal([
      { line: 3, startCol: 0, endCol: 12, newText: "register" },
      { line: 1, startCol: 8, endCol: 8, newText: " [register]" },
    ]);
  });

  it("places a new load line after existing loads", () => {
    expect(edits("load aragonos\nens:renew a 1y")).to.deep.equal([
      { line: 2, startCol: 0, endCol: 9, newText: "renew" },
      { line: 2, startCol: 0, endCol: 0, newText: "load ens [renew]\n" },
    ]);
  });
});

describe("Auto-import > import-list maintenance", () => {
  it("sorts new entries alphabetically, commands before helpers", () => {
    expect(
      edits(
        "load ens\nens:set-addr a b\nens:renew a 1y\nprint @ens:namehash(x)\nprint @ens:addr(y)",
      ),
    ).to.deep.equal([
      { line: 2, startCol: 0, endCol: 12, newText: "set-addr" },
      { line: 3, startCol: 0, endCol: 9, newText: "renew" },
      { line: 4, startCol: 6, endCol: 19, newText: "@namehash" },
      { line: 5, startCol: 6, endCol: 15, newText: "@addr" },
      {
        line: 1,
        startCol: 8,
        endCol: 8,
        newText: " [renew set-addr @addr @namehash]",
      },
    ]);
  });

  it("prunes an entry whose usage disappeared", () => {
    expect(edits("load ens [renew @addr]\nrenew a 1y")).to.deep.equal([
      { line: 1, startCol: 9, endCol: 22, newText: "[renew]" },
    ]);
  });

  it("removes the whole list when nothing remains used", () => {
    expect(edits("load ens [renew]\nprint hola")).to.deep.equal([
      { line: 1, startCol: 8, endCol: 16, newText: "" },
    ]);
  });

  it("re-imports a bare name that a loaded module exports", () => {
    expect(edits("load ens [renew]\nrenew a 1y\nregister b c")).to.deep.equal([
      { line: 1, startCol: 9, endCol: 16, newText: "[register renew]" },
    ]);
  });

  it("does not re-import names exported by more than one loaded module", () => {
    expect(
      edits("load ens\nload other\nregister a", undefined, {
        other: {
          commands: { register: noop },
          helpers: {},
          constants: {},
        },
      }),
    ).to.deep.equal([]);
  });

  it("leaves an unsorted list untouched when membership is unchanged", () => {
    expect(
      edits("load ens [@addr renew]\nrenew a 1y\nprint @addr(x)"),
    ).to.deep.equal([]);
  });

  it("fills an empty [] list instead of appending a second one", () => {
    expect(edits("load ens []\nens:renew a 1y")).to.deep.equal([
      { line: 2, startCol: 0, endCol: 9, newText: "renew" },
      { line: 1, startCol: 9, endCol: 11, newText: "[renew]" },
    ]);
  });
});
