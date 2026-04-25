import "../setup";
import { describe, it } from "bun:test";
import { expect, TestContext } from "@evmcrispr/test-utils";
import { EVMcrispr, Module, type ModuleContext } from "../../src";

describe("Core > hover", () => {
  const ctx = new TestContext();

  describe("over std command names", () => {
    it("should return hover info for 'set'", async () => {
      const script = "set $x 1";
      const result = await ctx.hover(script, { line: 1, col: 1 });
      expect(result).to.not.be.null;
      expect(result!.contents.join("\n")).to.include("set");
    });

    it("should return hover info for 'load'", async () => {
      const script = "load aragonos --as ar";
      const result = await ctx.hover(script, { line: 1, col: 0 });
      expect(result).to.not.be.null;
      expect(result!.contents.join("\n")).to.include("load");
    });
  });

  describe("over helpers", () => {
    it("should return hover info for @me", async () => {
      const script = "set $x @me";
      const result = await ctx.hover(script, { line: 1, col: 7 });
      expect(result).to.not.be.null;
      expect(result!.contents.join("\n")).to.include("@me");
    });

    it("should return hover info for @token", async () => {
      const script = "set $x @token(DAI)";
      const result = await ctx.hover(script, { line: 1, col: 7 });
      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      expect(c).to.include("@token");
      expect(c).to.include("address");
    });
  });

  describe("over variables", () => {
    it("should return hover info for $variable", async () => {
      const script = "set $myVar 42\nset $other $myVar";
      const result = await ctx.hover(script, { line: 2, col: 11 });
      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      expect(c).to.include("$myVar");
      expect(c).to.include("**Variable**");
    });

    it("should return variable hover even without a prior set definition", async () => {
      const script = "set $other $unknown";
      const result = await ctx.hover(script, { line: 1, col: 11 });
      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      expect(c).to.include("$unknown");
      expect(c).to.include("**Variable**");
    });
  });

  describe("over address literals", () => {
    it("should return EOA-style hover info for a 0x address literal", async () => {
      // Hover lands on the address literal in the script.
      const script = "set $x 0x000000000000000000000000000000000000aaaa";
      const result = await ctx.hover(script, { line: 1, col: 8 });
      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      expect(c).to.include("EOA");
      expect(c).to.include(
        "0x000000000000000000000000000000000000aAaa".toLowerCase(),
      );
    });

    it("should return Contract-style hover info for a deployed contract on the active chain", async () => {
      // WXDAI on Gnosis — the test fork chain.
      const script = "set $x 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
      const evm = ctx.createEvm();
      await evm.prewarm(script);
      const result = await evm.getHoverInfo(script, { line: 1, col: 8 });
      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      expect(c).to.include("**Contract**");
      expect(c).to.include("Code size:");
    });
  });

  describe("over address-returning helpers", () => {
    it("should still render the @ens(...) signature card without an address card when no cache entry exists", async () => {
      const script = "set $x @ens(vitalik.eth)";
      const result = await ctx.hover(script, { line: 1, col: 8 });
      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      // Always: helper signature.
      expect(c).to.include("@ens");
      expect(c).to.include("address");
      // The address card should NOT appear: hover is a pure cache reader and
      // cannot resolve helpers itself.
      expect(c).to.not.include("**EOA**");
      expect(c).to.not.include("**Contract**");
    });

    it("appends the address card under @token(...) after prewarm", async () => {
      const script = "set $x @token(DAI)";
      const evm = ctx.createEvm();
      await evm.prewarm(script);
      const result = await evm.getHoverInfo(script, { line: 1, col: 8 });
      expect(result).to.not.be.null;
      // The address card lives in its own section so Monaco draws a clear
      // divider line between the signature and the address details.
      expect(result!.contents.length).to.be.greaterThan(1);
      const c = result!.contents.join("\n");
      expect(c).to.include("@token");
      expect(c).to.match(/\*\*EOA\*\*|\*\*Contract\*\*/);
    });

    it("seeds variable bindings for any command with a `type: variable` argDef", async () => {
      // Regression: previously the prewarm walker only visited
      // `load`/`set`/`switch` commands, so variables created by
      // commands like `deploy`, `new-dao`, `new-token`, `install`,
      // `sign` and `for` were never seeded — hovering them returned
      // null. The walker now visits every command and trusts each
      // command's own argDefs to decide what to bind, so any
      // `type: "variable"` argDef on any command participates in
      // prewarm automatically.
      const script = "deploy $myContract Foo.sol\nprint $myContract";
      const evm = ctx.createEvm();
      await evm.prewarm(script);
      const result = await evm.getHoverInfo(script, { line: 2, col: 8 });
      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      expect(c).to.include("**Variable**");
      expect(c).to.include("$myContract");
      // Placeholder bindings (value === name) shouldn't render as
      // `$myContract = $myContract` — that's noise.
      expect(c).to.not.include("= $myContract");
    });

    it("seeds variable bindings for event-capture slots", async () => {
      // The `-> Withdrawn(uint, address) [$amount $to]` syntax
      // attaches an `EventCaptureNode` to a command. The walker has to
      // descend into `c.eventCaptures` and seed each slot as a USER
      // placeholder so hover finds `$amount` even though no command
      // argDef declares it.
      const script =
        "exec $contract withdraw() -> Withdrawn(uint,address) [$amount $to]\nprint $amount";
      const evm = ctx.createEvm();
      await evm.prewarm(script);
      const result = await evm.getHoverInfo(script, { line: 2, col: 8 });
      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      expect(c).to.include("**Variable**");
      expect(c).to.include("$amount");
      expect(c).to.not.include("= $amount");
    });

    it("seeds variable bindings for error-capture slots and bool flags", async () => {
      // `-!> Err(uint) [$shortfall]` (required) and `-?!> Err $e`
      // (optional, boolean) both produce USER bindings the walker
      // must seed so hover finds them. We exercise both shapes in one
      // script — the boolVar variant goes through a different code
      // path than the destructure-slot variant.
      const script = [
        "exec $contract transfer(uint) 100 -!> InsufficientBalance(uint) [$shortfall]",
        "exec $contract approve(address,uint) $spender 1 -?!> Unauthorized() $authErr",
        "print $shortfall",
        "print $authErr",
      ].join("\n");
      const evm = ctx.createEvm();
      await evm.prewarm(script);
      const shortfall = await evm.getHoverInfo(script, { line: 3, col: 8 });
      const authErr = await evm.getHoverInfo(script, { line: 4, col: 8 });
      expect(shortfall).to.not.be.null;
      expect(shortfall!.contents.join("\n")).to.include("$shortfall");
      expect(authErr).to.not.be.null;
      expect(authErr!.contents.join("\n")).to.include("$authErr");
    });

    it("appends the address card under @token(...) when used as a direct arg to a non-binding command", async () => {
      // Regression: previously the prewarm walker only visited
      // `load`/`set`/`switch` commands, so helpers used as direct args to
      // commands like `print` never reached the helper cache and hover
      // could not surface their address card.
      const script = "print @token(DAI)";
      const evm = ctx.createEvm();
      await evm.prewarm(script);
      const result = await evm.getHoverInfo(script, { line: 1, col: 8 });
      expect(result).to.not.be.null;
      expect(result!.contents.length).to.be.greaterThan(1);
      const c = result!.contents.join("\n");
      expect(c).to.include("@token");
      expect(c).to.match(/\*\*EOA\*\*|\*\*Contract\*\*/);
    });
  });

  describe("over variables with prewarmed values", () => {
    it("does not let an older slow prewarm overwrite newer hover bindings", async () => {
      let resolveOldStarted!: () => void;
      let releaseOld!: () => void;
      const oldStarted = new Promise<void>((resolve) => {
        resolveOldStarted = resolve;
      });
      const oldGate = new Promise<void>((resolve) => {
        releaseOld = resolve;
      });

      class PrewarmRaceModule extends Module {
        constructor(context: ModuleContext, alias?: string) {
          super(
            "prewarmrace",
            {},
            {
              raceValue: async (_module, h, interpreters) => {
                const value = String(
                  await interpreters.interpretNode(h.args[0]),
                );
                if (value === "old") {
                  resolveOldStarted();
                  await oldGate;
                }
                return value;
              },
            },
            { raceValue: "string" },
            { raceValue: true },
            { raceValue: [{ name: "value", type: "string" }] },
            { raceValue: "Return a controllable test value." },
            {},
            {},
            {},
            context,
            alias,
          );
        }
      }

      EVMcrispr.registerModule("prewarmrace", async () => ({
        default: PrewarmRaceModule,
      }));

      const evm = ctx.createEvm();
      const oldScript = "load prewarmrace\nset $x @raceValue(old)";
      const newScript = "load prewarmrace\nset $x @raceValue(new)";

      const oldPrewarm = evm.prewarm(oldScript);
      await oldStarted;
      await evm.prewarm(newScript);
      releaseOld();
      await oldPrewarm;

      const result = await evm.getHoverInfo(newScript, { line: 2, col: 5 });
      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      expect(c).to.include("= new");
      expect(c).to.not.include("= old");
    });

    it("renders the variable's resolved value after prewarm", async () => {
      const script = "set $myVar 42\nset $other $myVar";
      const evm = ctx.createEvm();
      await evm.prewarm(script);
      const result = await evm.getHoverInfo(script, { line: 2, col: 12 });
      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      expect(c).to.include("$myVar");
      expect(c).to.include("**Variable**");
      expect(c).to.include("= 42");
    });

    it("renders @num(1 + 4) as the precomputed value after prewarm", async () => {
      const script = "set $a @num(1 + 4)\nset $b $a";
      const evm = ctx.createEvm();
      await evm.prewarm(script);
      const result = await evm.getHoverInfo(script, { line: 2, col: 8 });
      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      expect(c).to.include("$a");
      expect(c).to.include("= 5");
    });

    it("evaluates nested @num arithmetic during prewarm", async () => {
      // Nested arithmetic (operator precedence) — proves the unified
      // interpreter handles helper invocations whose own args are themselves
      // helper invocations during prewarm.
      const script = "set $x @num(@num(1 + 4) * 2)\nset $y $x";
      const evm = ctx.createEvm();
      await evm.prewarm(script);
      const result = await evm.getHoverInfo(script, { line: 2, col: 8 });
      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      expect(c).to.include("$x");
      expect(c).to.include("= 10");
    });

    it("evaluates ArrayExpression rhs during prewarm", async () => {
      // The unified interpreter resolves ArrayExpression nodes too, so the
      // hover card shows the array contents rather than the unresolved AST.
      const script = "set $x [1 2 3]\nset $y $x";
      const evm = ctx.createEvm();
      await evm.prewarm(script);
      const result = await evm.getHoverInfo(script, { line: 2, col: 8 });
      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      expect(c).to.include("$x");
      // Each element from the resolved array should appear in the value line
      // (rendered as the array's `.toString()`, e.g. `1,2,3`).
      expect(c).to.match(/=\s+1.*2.*3/);
      // Must NOT be the placeholder `= $x` from when the walker couldn't
      // resolve the rhs.
      expect(c).to.not.include("= $x");
    });

    it("destructures helper results into individual variables", async () => {
      // `@block()` returns `[number, timestamp]`. The destructure pattern
      // should bind `$c` to the block number after prewarm so hover shows
      // the actual value rather than the literal string `$c`.
      const script = "set [$c] @block()\nprint $c";
      const evm = ctx.createEvm();
      await evm.prewarm(script);
      const result = await evm.getHoverInfo(script, { line: 2, col: 7 });
      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      expect(c).to.include("$c");
      expect(c).to.include("**Variable**");
      // The binding must NOT be the placeholder `= $c` from the old
      // walker's seed-with-own-name behaviour.
      expect(c).to.not.include("= $c");
      // Block number on the test fork is some bigint — assert we render
      // a numeric `=` line.
      expect(c).to.match(/=\s+\d+/);
    });

    it("appends the address card to a variable that resolves to an address", async () => {
      const script =
        "set $dao 0x000000000000000000000000000000000000aaaa\nset $other $dao";
      const evm = ctx.createEvm();
      await evm.prewarm(script);
      const result = await evm.getHoverInfo(script, { line: 2, col: 12 });
      expect(result).to.not.be.null;
      // Same as helpers: address card is its own section.
      expect(result!.contents.length).to.be.greaterThan(1);
      const c = result!.contents.join("\n");
      expect(c).to.include("$dao");
      expect(c).to.include("0x000000000000000000000000000000000000aaaa");
      expect(c).to.match(/\*\*EOA\*\*|\*\*Contract\*\*/);
    });

    it("redefining a variable shows the NEW value at the second `set`", async () => {
      const script = "set $x 1\nset $x 2";
      const evm = ctx.createEvm();
      await evm.prewarm(script);
      const result = await evm.getHoverInfo(script, { line: 2, col: 5 });
      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      expect(c).to.include("$x");
      expect(c).to.include("= 2");
      expect(c).to.not.include("= 1");
    });

    it("redefining a variable shows the OLD value at the first `set`", async () => {
      const script = "set $x 1\nset $x 2";
      const evm = ctx.createEvm();
      await evm.prewarm(script);
      const result = await evm.getHoverInfo(script, { line: 1, col: 5 });
      expect(result).to.not.be.null;
      const c = result!.contents.join("\n");
      expect(c).to.include("$x");
      expect(c).to.include("= 1");
      expect(c).to.not.include("= 2");
    });

    it("renders the per-line value when the variable is used after each `set`", async () => {
      const script = "set $x 1\nset $y $x\nset $x 2\nset $z $x";
      const evm = ctx.createEvm();
      await evm.prewarm(script);
      // Hover the `$x` reference on line 2 — should still be 1.
      const earlier = await evm.getHoverInfo(script, { line: 2, col: 8 });
      expect(earlier).to.not.be.null;
      expect(earlier!.contents.join("\n")).to.include("= 1");
      // Hover the `$x` reference on line 4 — should now be 2.
      const later = await evm.getHoverInfo(script, { line: 4, col: 8 });
      expect(later).to.not.be.null;
      expect(later!.contents.join("\n")).to.include("= 2");
    });
  });

  describe("edge cases", () => {
    it("should return null for whitespace", async () => {
      const script = "set $x 1";
      const result = await ctx.hover(script, { line: 1, col: 50 });
      expect(result).to.be.null;
    });

    it("should return null for empty lines", async () => {
      const script = "set $x 1\n\nset $y 2";
      const result = await ctx.hover(script, { line: 2, col: 0 });
      expect(result).to.be.null;
    });

    it("should return null for lines beyond the script", async () => {
      const script = "set $x 1";
      const result = await ctx.hover(script, { line: 10, col: 0 });
      expect(result).to.be.null;
    });
  });
});
