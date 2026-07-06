import "../../setup";

import { beforeEach, describe, it } from "bun:test";
import type { ModuleContext } from "@evmcrispr/sdk";
import { defineCommand, defineHelper, Module } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";

import type { ParseDiagnostic } from "../../../src";
import { createEvml, type EvmlTag } from "../../../src";

// A stub module exercising every schema-driven check. Its commands are
// referenced with the `stub:` prefix (bare module commands don't resolve at
// top level — the interpreter only looks at std / the scope module).
class StubModule extends Module {
  constructor(context: ModuleContext, alias?: string) {
    super(
      "stub",
      {
        needtwo: defineCommand({
          name: "needtwo",
          args: [
            { name: "a", type: "string" },
            { name: "b", type: "string" },
          ],
          run: async () => [],
        }),
        optone: defineCommand({
          name: "optone",
          args: [],
          opts: [{ name: "foo", type: "string" }],
          run: async () => [],
        }),
        addrone: defineCommand({
          name: "addrone",
          args: [{ name: "x", type: "address" }],
          run: async () => [],
        }),
        numone: defineCommand({
          name: "numone",
          args: [{ name: "n", type: "number" }],
          run: async () => [],
        }),
        blockcmd: defineCommand({
          name: "blockcmd",
          args: [{ name: "body", type: "block" }],
          run: async () => [],
        }),
        nob: defineCommand({
          name: "nob",
          args: [],
          batchable: false,
          run: async () => [],
        }),
        openbatch: defineCommand({
          name: "openbatch",
          args: [{ name: "body", type: "block" }],
          createsBatchContext: true,
          run: async () => [],
        }),
        setv: defineCommand({
          name: "setv",
          args: [
            { name: "v", type: "variable" },
            { name: "val", type: "any" },
          ],
          run: async () => [],
        }),
      },
      {
        htwo: defineHelper({
          name: "htwo",
          args: [
            { name: "a", type: "string" },
            { name: "b", type: "string" },
          ],
          run: async () => "ok",
        }),
        hnob: defineHelper({
          name: "hnob",
          args: [],
          batchable: false,
          run: async () => "ok",
        }),
      },
      { htwo: "string", hnob: "string" },
      { htwo: true, hnob: false },
      {
        htwo: [
          { name: "a", type: "string" },
          { name: "b", type: "string" },
        ],
        hnob: [],
      },
      {},
      {},
      {},
      {},
      context,
      alias,
    );
  }
}

describe("Analysis > semantic diagnostics", () => {
  let tag: EvmlTag;

  beforeEach(() => {
    tag = createEvml();
    tag.use(
      { name: "stub", load: async () => ({ default: StubModule }) },
      // Registered but never loaded, for the module-not-loaded check.
      { name: "other", load: async () => ({ default: StubModule }) },
    );
  });

  const analyze = (script: string): Promise<ParseDiagnostic[]> =>
    tag.workspace().getFullDiagnostics(script);

  const semantic = async (script: string): Promise<ParseDiagnostic[]> =>
    (await analyze(script)).filter((d) => d.source === "semantic");

  const codes = (ds: ParseDiagnostic[]): string[] => ds.map((d) => d.code!);

  describe("unknown-module", () => {
    it("flags an unregistered load target", async () => {
      const ds = await semantic("load ghost");
      expect(codes(ds)).to.include("unknown-module");
      expect(ds[0].message).to.match(/not registered/);
    });

    it("suggests a close module name", async () => {
      const ds = await semantic("load stubb");
      expect(ds[0].message).to.match(/Did you mean "stub"/);
    });

    it("does not flag a registered module", async () => {
      const ds = await semantic("load stub");
      expect(codes(ds)).to.not.include("unknown-module");
    });

    it("flags an unknown module prefix", async () => {
      const ds = await semantic("load stub\nghost:foo");
      expect(codes(ds)).to.include("unknown-module");
    });
  });

  describe("module-not-loaded", () => {
    it("flags a registered-but-not-loaded module prefix", async () => {
      const ds = await semantic("other:needtwo a b");
      expect(codes(ds)).to.include("module-not-loaded");
      expect(ds[0].message).to.match(/load other/);
    });

    it("does not flag once the module is loaded", async () => {
      const ds = await semantic("load other\nother:needtwo a b");
      expect(codes(ds)).to.not.include("module-not-loaded");
    });
  });

  describe("unknown-command", () => {
    it("flags a typo on a loaded module", async () => {
      const ds = await semantic("load stub\nstub:needtoo a b");
      expect(codes(ds)).to.include("unknown-command");
      expect(ds[0].message).to.match(/does not exist on module "stub"/);
      expect(ds[0].message).to.match(/Did you mean "needtwo"/);
    });

    it("does not flag a valid module command", async () => {
      const ds = await semantic("load stub\nstub:needtwo a b");
      expect(codes(ds)).to.not.include("unknown-command");
    });

    it("does not flag a std command", async () => {
      const ds = await semantic("set $x 1");
      expect(codes(ds)).to.not.include("unknown-command");
    });

    it("does not flag a def-declared command", async () => {
      const ds = await semantic('def greet "()" (\n  set $x 1\n)\ngreet');
      expect(codes(ds)).to.not.include("unknown-command");
    });
  });

  describe("arg-count", () => {
    it("flags too few command arguments", async () => {
      const ds = await semantic("load stub\nstub:needtwo onlyone");
      const d = ds.find((x) => x.code === "arg-count");
      expect(d).to.exist;
      expect(d!.message).to.match(/needtwo/);
    });

    it("flags too many command arguments", async () => {
      const ds = await semantic("load stub\nstub:needtwo a b c");
      expect(codes(ds)).to.include("arg-count");
    });

    it("does not flag the right count", async () => {
      const ds = await semantic("load stub\nstub:needtwo a b");
      expect(codes(ds)).to.not.include("arg-count");
    });

    it("flags wrong helper arity", async () => {
      const ds = await semantic("load stub\nset $x @htwo(1)");
      const d = ds.find((x) => x.code === "arg-count");
      expect(d).to.exist;
      expect(d!.message).to.match(/@htwo/);
    });

    it("does not flag correct helper arity", async () => {
      const ds = await semantic('load stub\nset $x @htwo(1 "two")');
      expect(codes(ds)).to.not.include("arg-count");
    });
  });

  describe("options", () => {
    it("flags an unknown option", async () => {
      const ds = await semantic("load stub\nstub:optone --bar 1");
      const d = ds.find((x) => x.code === "unknown-option");
      expect(d).to.exist;
      expect(d!.message).to.match(/Valid options: --foo/);
    });

    it("warns on a duplicate option", async () => {
      const ds = await semantic("load stub\nstub:optone --foo a --foo b");
      const d = ds.find((x) => x.code === "duplicate-option");
      expect(d).to.exist;
      expect(d!.severity).to.equal("warning");
    });

    it("does not flag a valid option", async () => {
      const ds = await semantic("load stub\nstub:optone --foo a");
      expect(codes(ds)).to.not.include("unknown-option");
    });
  });

  describe("literal-type-mismatch", () => {
    it("flags a non-address literal in an address slot", async () => {
      const ds = await semantic("load stub\nstub:addrone notanaddress");
      const d = ds.find((x) => x.code === "literal-type-mismatch");
      expect(d).to.exist;
      expect(d!.message).to.match(/must be a valid address/);
    });

    it("flags a non-number literal in a number slot", async () => {
      const ds = await semantic("load stub\nstub:numone abc");
      expect(codes(ds)).to.include("literal-type-mismatch");
    });

    it("does not flag a valid literal", async () => {
      const ds = await semantic("load stub\nstub:numone 42");
      expect(codes(ds)).to.not.include("literal-type-mismatch");
    });

    it("does not flag a variable in a typed slot (unknown statically)", async () => {
      const ds = await semantic("load stub\nset $a 1\nstub:numone $a");
      expect(codes(ds)).to.not.include("literal-type-mismatch");
    });
  });

  describe("undefined-variable", () => {
    it("errors on a never-defined variable", async () => {
      const ds = await semantic("load stub\nstub:needtwo $missing a");
      const d = ds.find((x) => x.code === "undefined-variable");
      expect(d).to.exist;
      expect(d!.severity).to.equal("error");
      expect(d!.message).to.match(/not defined/);
    });

    it("warns on use-before-definition", async () => {
      const ds = await semantic(
        "load stub\nstub:needtwo $later a\nset $later 1",
      );
      const d = ds.find((x) => x.code === "undefined-variable");
      expect(d).to.exist;
      expect(d!.severity).to.equal("warning");
    });

    it("does not flag a defined variable", async () => {
      const ds = await semantic("set $x 1\nload stub\nstub:needtwo $x a");
      expect(codes(ds)).to.not.include("undefined-variable");
    });

    it("does not flag a loop variable inside the loop body", async () => {
      const ds = await semantic(
        "set $items [1 2 3]\nloop $item of $items (\n  set $y $item\n)",
      );
      expect(codes(ds)).to.not.include("undefined-variable");
    });

    it("does not flag a destructure slot", async () => {
      const ds = await semantic("set [$a $b] @htwo\nprint $a $b");
      const undef = (await semantic("set [$a $b] @htwo\nprint $a $b")).filter(
        (d) => d.code === "undefined-variable" && d.message.includes("$a"),
      );
      expect(undef).to.have.length(0);
      void ds;
    });

    it("does not flag a capture slot used later", async () => {
      const ds = await semantic(
        "load stub\nstub:needtwo a b -> Transfer(address) [$to]\nprint $to",
      );
      const undef = ds.filter(
        (d) => d.code === "undefined-variable" && d.message.includes("$to"),
      );
      expect(undef).to.have.length(0);
    });

    it("does not flag module config variables", async () => {
      const ds = await semantic("print $stub:someconfig");
      expect(codes(ds)).to.not.include("undefined-variable");
    });
  });

  describe("not-batchable", () => {
    it("flags a non-batchable command inside batch", async () => {
      const ds = await semantic("load stub\nbatch (\n  stub:nob\n)");
      const d = ds.find((x) => x.code === "not-batchable");
      expect(d).to.exist;
      expect(d!.message).to.match(/cannot be used inside batch/);
    });

    it("flags a non-batchable helper inside batch", async () => {
      const ds = await semantic("load stub\nbatch (\n  set $x @hnob\n)");
      const d = ds.find((x) => x.code === "not-batchable");
      expect(d).to.exist;
      expect(d!.message).to.match(/@hnob/);
    });

    it("does not flag a batchable command inside batch", async () => {
      const ds = await semantic("load stub\nbatch (\n  stub:needtwo a b\n)");
      expect(codes(ds)).to.not.include("not-batchable");
    });

    it("does not flag a non-batchable command outside a batch", async () => {
      const ds = await semantic("load stub\nstub:nob");
      expect(codes(ds)).to.not.include("not-batchable");
    });

    it("honors createsBatchContext on non-std commands", async () => {
      // A module command (governor:propose, safe:execute, …) that opens its own
      // batch context rejects non-batchable commands in its block too.
      const ds = await semantic("load stub\nstub:openbatch (\n  stub:nob\n)");
      const d = ds.find((x) => x.code === "not-batchable");
      expect(d).to.exist;
      expect(d!.message).to.match(/cannot be used inside stub:openbatch/);
    });
  });

  describe("block body module scope", () => {
    it("resolves unprefixed commands against the block command's module, with std fallback", async () => {
      // Inside stub:blockcmd, `needtwo` is stub's command (unprefixed) and
      // `wait` falls back to std since stub declares no `wait`. This mirrors
      // the runtime scope-module resolution (safe:propose, connect, …).
      const ds = await semantic(
        "load stub\nstub:blockcmd (\n  needtwo a b\n  wait 60\n)",
      );
      expect(ds).to.deep.equal([]);
    });
  });

  describe("missing-block", () => {
    it("flags a missing required block", async () => {
      const ds = await semantic("load stub\nstub:blockcmd");
      expect(codes(ds)).to.include("missing-block");
    });

    it("does not flag a provided block", async () => {
      const ds = await semantic("load stub\nstub:blockcmd (\n  set $x 1\n)");
      expect(codes(ds)).to.not.include("missing-block");
    });
  });

  describe("return-capture-marker", () => {
    it("flags a return destructure without a $ marker", async () => {
      const ds = await semantic("set $x $dao::getInfo()[_ _]\nset $dao 1");
      expect(codes(ds)).to.include("return-capture-marker");
    });

    it("does not flag a return destructure with a $ marker", async () => {
      const ds = await semantic("set $dao 1\nset $x $dao::getInfo()[_ $]");
      expect(codes(ds)).to.not.include("return-capture-marker");
    });
  });

  describe("editor formatting", () => {
    it("carries a precise semantic range from the node loc", async () => {
      const [d] = await semantic("load stub\nstub:numone abc");
      // `abc` is on line 2 (1-indexed), starting after `stub:numone ` (12 cols).
      expect(d.line).to.equal(2);
      expect(d.col).to.equal(12);
      expect(d.endLine).to.equal(2);
      expect(d.endCol).to.equal(15);
      expect(d.source).to.equal("semantic");
    });

    it("sorts diagnostics by line then column", async () => {
      const ds = await semantic(
        "load stub\nstub:numone abc\nstub:addrone nope",
      );
      const lines = ds.map((d) => d.line);
      const sorted = [...lines].sort((a, b) => a - b);
      expect(lines).to.deep.equal(sorted);
    });
  });

  describe("clean script", () => {
    it("produces no diagnostics for a valid script", async () => {
      const ds = await semantic(
        "load stub\nset $x 1\nstub:needtwo $x two\nstub:optone --foo a",
      );
      expect(ds).to.have.length(0);
    });
  });
});
