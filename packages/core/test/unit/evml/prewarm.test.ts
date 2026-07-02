import { describe, it } from "bun:test";
import Std from "@evmcrispr/module-std";
import type { HelperResolver, ModuleContext } from "@evmcrispr/sdk";
import { BindingsManager, BindingsSpace } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { gnosis, mainnet } from "viem/chains";
import type { PrewarmSnapshot } from "../../../src/scriptWalk";
import { walkScript } from "../../../src/scriptWalk";

/**
 * Incremental prewarm tests, driven directly through `walkScript`.
 *
 * The spy helper returns an incrementing counter, so a binding's value
 * reveals *when* it was resolved: a replayed checkpoint keeps the value
 * from the original walk, a re-walk picks up a fresh counter value.
 * Each walk gets a fresh module cache so helper memoization can't mask
 * whether checkpoint replay happened.
 */
function makeSpy() {
  let counter = 0;
  const calls: { name: string; args: string[]; chainId: number }[] = [];
  const resolveHelper: HelperResolver = async (name, args, chainId) => {
    calls.push({ name, args, chainId });
    counter += 1;
    return String(counter);
  };
  return { calls, resolveHelper };
}

const std = new Std({} as ModuleContext);

const stdBinding = () =>
  new BindingsManager([
    {
      type: BindingsSpace.MODULE,
      identifier: "std",
      value: {
        commands: std.commands,
        helpers: { ...std.helpers, spy: async () => "unused" },
        helperReturnTypes: { ...std.helperReturnTypes, spy: "string" },
        helperHasArgs: { ...std.helperHasArgs, spy: true },
        helperArgDefs: { ...std.helperArgDefs, spy: [] },
        helperDescriptions: std.helperDescriptions,
        commandDescriptions: std.commandDescriptions,
        types: std.types,
      },
    },
  ]);

async function walk(
  script: string,
  resolveHelper: HelperResolver,
  previous?: PrewarmSnapshot,
  initialChainId: number = mainnet.id,
) {
  return walkScript(
    script,
    Number.POSITIVE_INFINITY,
    stdBinding(),
    resolveHelper,
    undefined,
    initialChainId,
    previous,
  );
}

const USER = BindingsSpace.USER;

describe("evml > incremental prewarm", () => {
  it("reuses the whole prefix when appending at the end", async () => {
    const { resolveHelper } = makeSpy();
    const scriptV1 = "set $a @spy(one)";
    const first = await walk(scriptV1, resolveHelper);
    expect(first.bindings.getBindingValue("$a", USER)).to.equal("1");
    expect(first.snapshot.checkpoints).to.have.lengthOf(1);

    const scriptV2 = "set $a @spy(one)\nset $b @spy(two)";
    const second = await walk(scriptV2, resolveHelper, first.snapshot);
    // $a replayed from the checkpoint (still "1"); only $b resolved anew.
    expect(second.bindings.getBindingValue("$a", USER)).to.equal("1");
    expect(second.bindings.getBindingValue("$b", USER)).to.not.equal("1");
    expect(second.snapshot.checkpoints).to.have.lengthOf(2);
  });

  it("re-walks from the changed command on mid-script edits", async () => {
    const { resolveHelper } = makeSpy();
    const v1 = "set $a @spy(one)\nset $b @spy(two)\nset $c @spy(three)";
    const first = await walk(v1, resolveHelper);
    expect(first.bindings.getBindingValue("$b", USER)).to.equal("2");

    const v2 = "set $a @spy(one)\nset $b @spy(changed)\nset $c @spy(three)";
    const second = await walk(v2, resolveHelper, first.snapshot);
    // $a replayed; $b and $c re-resolved (bindings flow forward).
    expect(second.bindings.getBindingValue("$a", USER)).to.equal("1");
    expect(second.bindings.getBindingValue("$b", USER)).to.not.equal("2");
  });

  it("does not match on a character prefix when the last token grew", async () => {
    const { resolveHelper } = makeSpy();
    const first = await walk("set $hello @spy(x)", resolveHelper);
    expect(first.bindings.getBindingValue("$hello", USER)).to.equal("1");

    // `set $hello …` is a character prefix of `set $hellow …` but the
    // token changed — the checkpoint must not be reused.
    const second = await walk(
      "set $hellow @spy(x)",
      resolveHelper,
      first.snapshot,
    );
    expect(second.bindings.getBindingValue("$hello", USER)).to.be.undefined;
    expect(second.bindings.getBindingValue("$hellow", USER)).to.equal("2");
  });

  it("reuses checkpoints across line shifts and remaps history lines", async () => {
    const { resolveHelper } = makeSpy();
    const first = await walk("set $a @spy(one)", resolveHelper);
    expect(first.variableHistory.get("$a")?.[0].line).to.equal(1);

    // Insert two blank lines above: same command text, new line number.
    const second = await walk(
      "\n\nset $a @spy(one)",
      resolveHelper,
      first.snapshot,
    );
    // Replayed (value survives with a fresh helper cache) and remapped.
    expect(second.bindings.getBindingValue("$a", USER)).to.equal("1");
    expect(second.variableHistory.get("$a")?.[0].line).to.equal(3);
  });

  it("checkpoints chain state across switch commands", async () => {
    const { calls, resolveHelper } = makeSpy();
    const v1 = "switch gnosis\nset $a @spy(one)";
    const first = await walk(v1, resolveHelper);
    expect(first.chainId).to.equal(gnosis.id);

    const v2 = "switch gnosis\nset $a @spy(one)\nset $b @spy(two)";
    const second = await walk(v2, resolveHelper, first.snapshot);
    expect(second.bindings.getBindingValue("$a", USER)).to.equal("1");
    // The new command resolved on the switched-to chain restored from
    // the last reused checkpoint.
    const newCall = calls.find((c) => c.args.includes("two"));
    expect(newCall?.chainId).to.equal(gnosis.id);
  });

  it("ignores snapshots recorded from a different starting chain", async () => {
    const { resolveHelper } = makeSpy();
    const first = await walk("set $a @spy(one)", resolveHelper);
    const second = await walk(
      "set $a @spy(one)",
      resolveHelper,
      first.snapshot,
      gnosis.id,
    );
    // Prefix not reused: the helper ran again.
    expect(second.bindings.getBindingValue("$a", USER)).to.not.equal("1");
  });

  it("reuses nothing when the previous snapshot is empty", async () => {
    const { resolveHelper } = makeSpy();
    const result = await walk("set $a @spy(one)", resolveHelper, {
      initialChainId: mainnet.id,
      checkpoints: [],
    });
    expect(result.bindings.getBindingValue("$a", USER)).to.equal("1");
  });
});
