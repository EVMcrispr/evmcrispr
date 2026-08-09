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
  constructor(context: ModuleContext) {
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
        hopt: defineHelper({
          name: "hopt",
          args: [
            { name: "a", type: "string" },
            { name: "b", type: "string", optional: true },
            { name: "c", type: "number", optional: true },
          ],
          run: async () => "ok",
        }),
        // Batchable flag carried ONLY by registry metadata (below) — the
        // wrapper deliberately has no `.batchable` so the analyzer must
        // read the declared flag without dynamically importing.
        hmeta: defineHelper({
          name: "hmeta",
          args: [],
          run: async () => "ok",
        }),
      },
      { htwo: "string", hnob: "string", hopt: "string", hmeta: "string" },
      { htwo: true, hnob: false, hopt: true, hmeta: false },
      {
        htwo: [
          { name: "a", type: "string" },
          { name: "b", type: "string" },
        ],
        hnob: [],
        hopt: [
          { name: "a", type: "string" },
          { name: "b", type: "string", optional: true },
          { name: "c", type: "number", optional: true },
        ],
      },
      {},
      {},
      {},
      {},
      context,
      [
        { name: "svc", type: "string", description: "Service URL." },
        { name: "target", type: "address", description: "Address config." },
        {
          name: "endpoint",
          type: "string",
          description: "Config with a default.",
          default: "https://example.com",
        },
      ],
      [],
      [],
      {},
      // Registry-declared batchable metadata: hmeta's wrapper carries no
      // `.batchable`, so the analyzer only sees this map.
      { hmeta: false },
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
      const ds = await semantic("load stub [@htwo]\nset $x @htwo(1)");
      const d = ds.find((x) => x.code === "arg-count");
      expect(d).to.exist;
      expect(d!.message).to.match(/@htwo/);
    });

    it("does not flag correct helper arity", async () => {
      const ds = await semantic('load stub [@htwo]\nset $x @htwo(1 "two")');
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

  describe("malformed-hex-literal", () => {
    it("flags a truncated address placeholder", async () => {
      const ds = await semantic("set $x 0x1234...abcd");
      const d = ds.find((x) => x.code === "malformed-hex-literal");
      expect(d).to.exist;
      expect(d!.message).to.match(/not a valid address or hex value/);
    });

    it("flags a 0x-prefixed bareword nested in a helper arg", async () => {
      const ds = await semantic("set $x @get(0x8F94...)");
      expect(codes(ds)).to.include("malformed-hex-literal");
    });

    it("does not flag a valid address literal", async () => {
      const ds = await semantic(
        "set $x 0x4F2083f5fBede34C2714aFfb3105539775f7FE64",
      );
      expect(codes(ds)).to.not.include("malformed-hex-literal");
    });

    it("does not flag a valid hex value (upper or lower case)", async () => {
      const ds = await semantic("set $x 0xdeadBEEF");
      expect(codes(ds)).to.not.include("malformed-hex-literal");
    });

    it("does not flag a plain identifier bareword", async () => {
      const ds = await semantic("switch gnosis");
      expect(codes(ds)).to.not.include("malformed-hex-literal");
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

    it("does not flag a tx-capture variable used later", async () => {
      const ds = await semantic(
        "load stub\nstub:needtwo a b $> $tx $*> $txs\nprint $tx $txs",
      );
      const undef = ds.filter((d) => d.code === "undefined-variable");
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
      const ds = await semantic(
        "load stub [@hnob]\nbatch (\n  set $x @hnob\n)",
      );
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

    it("flags a helper whose batchable flag lives only in registry metadata", async () => {
      // hmeta's wrapper has no `.batchable`; the diagnostic can only come
      // from the ModuleData.helperBatchable map (registry-first read).
      const ds = await semantic(
        "load stub [@hmeta]\nbatch (\n  set $x @hmeta\n)",
      );
      const d = ds.find((x) => x.code === "not-batchable");
      expect(d).to.exist;
      expect(d!.message).to.match(/@hmeta/);
    });

    it("does not flag the registry-metadata helper outside a batch", async () => {
      const ds = await semantic("load stub [@hmeta]\nset $x @hmeta");
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

  describe("block body resolution", () => {
    it("resolves unprefixed commands inside blocks via imports and std only", async () => {
      // Block scope no longer exists: inside stub:blockcmd, `needtwo` must
      // be imported (or qualified) and `wait` resolves via the std prelude.
      const ds = await semantic(
        "load stub [needtwo]\nstub:blockcmd (\n  needtwo a b\n  wait 60\n)",
      );
      expect(ds).to.deep.equal([]);

      const unimported = await semantic(
        "load stub\nstub:blockcmd (\n  needtwo a b\n)",
      );
      expect(unimported.map((d) => d.code)).to.include("unknown-command");
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

  describe("named args", () => {
    it("accepts a named optional arg, skipping earlier optionals", async () => {
      const ds = await semantic('load stub [@hopt]\nset $x @hopt("a" c:3)');
      expect(codes(ds)).to.be.empty;
    });

    it("flags an unknown named arg with a suggestion", async () => {
      const ds = await semantic('load stub [@hopt]\nset $x @hopt("a" cc:3)');
      const d = ds.find((x) => x.code === "unknown-named-arg");
      expect(d).to.exist;
      expect(d!.message).to.match(/Did you mean "c"/);
    });

    it("flags a duplicate named arg", async () => {
      const ds = await semantic('load stub [@hopt]\nset $x @hopt("a" c:1 c:2)');
      expect(codes(ds)).to.include("duplicate-named-arg");
    });

    it("flags a named arg before a positional one", async () => {
      const ds = await semantic('load stub [@hopt]\nset $x @hopt(c:1 "a")');
      expect(codes(ds)).to.include("named-before-positional");
    });

    it("flags a def filled both positionally and by name", async () => {
      const ds = await semantic('load stub [@hopt]\nset $x @hopt("a" "b" b:2)');
      expect(codes(ds)).to.include("named-arg-conflict");
    });

    it("counts named args out of the positional arity", async () => {
      const ds = await semantic("load stub [@hopt]\nset $x @hopt(c:3)");
      expect(codes(ds)).to.include("arg-count");
    });

    it("flags mixed record/positional array elements", async () => {
      const ds = await semantic("set $x [1 a:2]");
      expect(codes(ds)).to.include("mixed-array-elements");
    });

    it("accepts a pure record literal", async () => {
      const ds = await semantic("set $x [a:1 b:2]");
      expect(codes(ds)).to.be.empty;
    });

    it("flags named args inside inline call expressions", async () => {
      const ds = await semantic(
        "set $t 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d\nset $x $t::transfer(a:1)",
      );
      expect(codes(ds)).to.include("named-arg-in-call");
    });

    it("flags a name:value entry in a load import list", async () => {
      const ds = await semantic("load stub [needtwo:foo]");
      expect(ds.some((d) => /name:value/.test(d.message))).to.be.true;
    });
  });

  describe("control-flow placement", () => {
    it("flags loop break outside a loop", async () => {
      const ds = await semantic("loop break");
      expect(codes(ds)).to.include("control-flow-placement");
      expect(ds[0].message).to.match(/inside a loop block/);
    });

    it("flags loop continue outside a loop", async () => {
      const ds = await semantic("loop continue");
      expect(codes(ds)).to.include("control-flow-placement");
    });

    it("accepts loop break nested under if inside a loop", async () => {
      const ds = await semantic(
        "loop $i of [1 2] (\n  if @bool($i == 1) (\n    loop break\n  )\n)",
      );
      expect(codes(ds)).to.not.include("control-flow-placement");
    });

    it("flags loop break with extra arguments", async () => {
      const ds = await semantic("loop $i of [1 2] (\n  loop break now\n)");
      expect(codes(ds)).to.include("arg-count");
    });

    it("flags a def body as a boundary for loop break", async () => {
      const ds = await semantic(
        'def leaky "" (\n  loop break\n)\nloop $i of [1 2] (\n  leaky\n)',
      );
      expect(codes(ds)).to.include("control-flow-placement");
    });

    it("accepts loop break in a loop inside a def body", async () => {
      const ds = await semantic(
        'def fine "" (\n  loop $i of [1 2] (\n    loop break\n  )\n)\nfine',
      );
      expect(codes(ds)).to.not.include("control-flow-placement");
    });

    it("flags a loop break crossing a batch boundary", async () => {
      const ds = await semantic(
        "load stub\nloop $i of [1 2] (\n  stub:openbatch (\n    loop break\n  )\n)",
      );
      const d = ds.find((x) => x.code === "control-flow-placement");
      expect(d).to.exist;
      expect(d!.message).to.match(/cannot cross the stub:openbatch boundary/);
    });

    it("flags def return outside a def command body", async () => {
      const ds = await semantic("def return");
      expect(codes(ds)).to.include("control-flow-placement");
      expect(ds[0].message).to.match(/inside a def command body/);
    });

    it("accepts def return inside a def command body", async () => {
      const ds = await semantic(
        'def guarded "" (\n  if true (\n    def return\n  )\n  set $x 1\n)\nguarded',
      );
      expect(codes(ds)).to.not.include("control-flow-placement");
    });

    it("flags def return directly inside a module block", async () => {
      const ds = await semantic("def module m (\n  def return\n)");
      expect(codes(ds)).to.include("control-flow-placement");
    });

    it("accepts def return in a command def inside a module block", async () => {
      const ds = await semantic(
        'def module m (\n  def early "" (\n    def return\n  )\n)',
      );
      expect(codes(ds)).to.not.include("control-flow-placement");
    });

    it("flags a loop of form without a block", async () => {
      const ds = await semantic("loop $i of [1 2]");
      expect(codes(ds)).to.include("missing-block");
    });

    it("flags an unknown loop form", async () => {
      const ds = await semantic("loop $i (\n  set $x 1\n)");
      expect(codes(ds)).to.include("unknown-loop-form");
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

  describe("config variables", () => {
    it("accepts declared config sets and reads", async () => {
      const ds = await semantic(
        'load stub\nset $stub:svc "https://x"\nprint $stub:svc',
      );
      expect(ds).to.have.length(0);
    });

    it("flags unknown config keys with a suggestion", async () => {
      const ds = await semantic('load stub\nset $stub:scv "https://x"');
      expect(codes(ds)).to.include("unknown-config");
      expect(ds[0].message).to.include('Did you mean "svc"');
    });

    it("flags config vars of unloaded/unregistered modules", async () => {
      expect(codes(await semantic('set $other:svc "x"'))).to.include(
        "module-not-loaded",
      );
      expect(codes(await semantic('set $ghost:svc "x"'))).to.include(
        "unknown-module",
      );
    });

    it("warns when reading a config that is never set and has no default", async () => {
      const ds = await semantic("load stub\nprint $stub:svc");
      expect(codes(ds)).to.include("unset-config");
      expect(ds[0].severity).to.equal("warning");
    });

    it("does not warn when a default exists or the config is set", async () => {
      expect(await semantic("load stub\nprint $stub:endpoint")).to.have.length(
        0,
      );
      expect(
        await semantic('load stub\nset $stub:svc "x"\nprint $stub:svc'),
      ).to.have.length(0);
    });

    it("rejects config vars in non-set binding positions", async () => {
      const ds = await semantic("load stub\nstub:setv $stub:svc 1");
      expect(codes(ds)).to.include("config-set-only");
    });

    it("type-checks literal config values", async () => {
      const ds = await semantic("load stub\nset $stub:target 42");
      expect(codes(ds)).to.include("literal-type-mismatch");
    });

    it("flags malformed colon names", async () => {
      const ds = await semantic('load stub\nset $stub:bad.key "x"');
      expect(codes(ds)).to.include("invalid-config-var");
    });

    it("hints legacy dotted names toward the declared config", async () => {
      const ds = await semantic('load stub\nset $token.svc "x"');
      expect(codes(ds)).to.include("config-near-miss");
      expect(ds[0].message).to.include("$stub:svc");
    });
  });

  describe("inline module blocks", () => {
    it("validates qualified calls against the synthesized schema", async () => {
      const clean = await semantic(
        `def module m (
  def @double "$n: number -> number" @num($n * 2)
  def show "$a: string $b: string" (
    print $a
  )
)
print @m:double(2)
m:show one two`,
      );
      expect(clean).to.have.length(0);

      const wrongArity = await semantic(
        `def module m (
  def show "$a: string $b: string" (
    print $a
  )
)
m:show one`,
      );
      expect(codes(wrongArity)).to.include("arg-count");

      const unknown = await semantic(
        `def module m (
  def @double "$n: number -> number" @num($n * 2)
)
print @m:nope(1)`,
      );
      expect(codes(unknown)).to.include("unknown-helper");
    });

    it("flags non-def commands inside module blocks", async () => {
      const ds = await semantic(
        `def module m (
  set $x 1
)`,
      );
      expect(codes(ds)).to.include("module-def-only");
    });

    it("flags duplicate defs and invalid names", async () => {
      expect(
        codes(
          await semantic(
            `def module m (
  def @x "number" 1
  def @x "number" 2
)`,
          ),
        ),
      ).to.include("duplicate-def");

      expect(
        codes(
          await semantic(
            `def module std (
  def @x "number" 1
)`,
          ),
        ),
      ).to.include("invalid-module-name");

      const shadow = await semantic(
        `def module stub (
  def @x "number" 1
)`,
      );
      expect(codes(shadow)).to.include("module-shadows-registered");
      expect(shadow[0].severity).to.equal("warning");

      // Actually loaded name → hard collision.
      expect(
        codes(
          await semantic(
            `load stub
def module stub (
  def @x "number" 1
)`,
          ),
        ),
      ).to.include("module-name-collision");
    });
  });

  describe("load --from", () => {
    it("treats external modules as opaque (zero diagnostics offline)", async () => {
      const ds = await semantic(
        `load x --from ipfs://QmSomeCid
x:anything 1 2 3
print @x:whatever(5)`,
      );
      expect(ds).to.have.length(0);
    });

    it("validates the source scheme and warns on registry shadowing", async () => {
      expect(
        codes(await semantic("load x --from https://example.com/lib.evml")),
      ).to.include("invalid-module-source");
      const shadow = await semantic("load stub --from ipfs://QmSomeCid");
      expect(codes(shadow)).to.include("module-shadows-registered");
      expect(shadow[0].severity).to.equal("warning");
    });
  });
  describe("capture structure", () => {
    it("allows tx and event captures on if/loop", async () => {
      const ifDs = await semantic("if true (\n  set $x 5\n) $> $tx");
      expect(codes(ifDs)).to.not.include("capture-on-block-command");

      const evDs = await semantic(
        "loop 2 (\n  set $x 5\n) -> Transfer(address) [$to]",
      );
      expect(codes(evDs)).to.not.include("capture-on-block-command");
    });

    it("flags error captures on if/loop and def commands", async () => {
      const ifDs = await semantic("if true (\n  set $x 5\n) -!> [$reason]");
      expect(codes(ifDs)).to.include("capture-on-block-command");

      const defDs = await semantic(
        'def go "()" (\n  set $x 5\n)\ngo -!> [$reason]',
      );
      expect(codes(defDs)).to.include("capture-on-block-command");
    });

    it("does not flag captures on batch", async () => {
      const ds = await semantic(
        "load stub\nbatch (\n  stub:needtwo a b\n) $> $tx",
      );
      expect(codes(ds)).to.not.include("capture-on-block-command");
    });

    it("flags tx captures combined with error captures", async () => {
      const ds = await semantic(
        "load stub\nstub:needtwo a b $> $tx -!> [$reason]",
      );
      expect(codes(ds)).to.include("tx-capture-with-error-capture");
    });

    it("flags duplicate tx-capture forms", async () => {
      const ds = await semantic("load stub\nstub:needtwo a b $> $a $> $b");
      expect(codes(ds)).to.include("duplicate-tx-capture");

      const ok = await semantic("load stub\nstub:needtwo a b $> $a $*> $b");
      expect(codes(ok)).to.not.include("duplicate-tx-capture");
    });
  });
});
