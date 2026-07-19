import { afterEach, describe, expect, it } from "bun:test";
import { BindingsManager } from "../../src/BindingsManager";
import { EvmlModule } from "../../src/EvmlModule";
import { IPFSResolver } from "../../src/IPFSResolver";
import type {
  DefValue,
  ModuleContext,
  NodesInterpreters,
} from "../../src/types";
import { BindingsSpace, resolveHelper } from "../../src/types";
import { normalizeModuleSource } from "../../src/utils/moduleSource";

function fakeContext(): ModuleContext {
  const bm = new BindingsManager();
  return {
    bindingsManager: bm,
    nonces: {},
    ipfsResolver: new IPFSResolver(),
    modules: [],
    getClient: async () => {
      throw new Error("no client");
    },
    getChainId: async () => 100,
    getChain: async () => undefined,
    switchChainId: () => {
      throw new Error("no switch");
    },
    getConnectedAccount: async () => "0x" as any,
    getTransport: () => {
      throw new Error("no transport");
    },
    setClient: () => {},
    setConnectedAccount: () => {},
    log: () => {},
    loadModule: async () => {
      throw new Error("no registry");
    },
    getAvailableModuleNames: () => [],
    parseEvml: () => {
      throw new Error("no parser");
    },
  };
}

const stubInterpreters: NodesInterpreters = {
  interpretNode: async () => undefined,
  interpretNodes: async () => [],
};

function commandDef(run: DefValue["run"]): DefValue {
  return {
    kind: "command",
    run: run as any,
    argDefs: [],
    optDefs: [],
    bodyNode: {} as any,
  };
}

describe("EvmlModule", () => {
  it("maps def keys to command/helper records with metadata", () => {
    const defs = new Map<string, DefValue>([
      ["greet", commandDef(async () => [])],
      [
        "@fee",
        {
          kind: "helper",
          run: (async () => "1") as any,
          argDefs: [{ name: "amount", type: "number" }],
          returnType: "number",
          bodyNode: {} as any,
        },
      ],
    ]);
    const mod = new EvmlModule("mylib", "canonical-lib", defs, fakeContext());

    expect(mod.name).toBe("mylib");
    expect(mod.canonicalName).toBe("canonical-lib");
    expect(Object.keys(mod.commands)).toEqual(["greet"]);
    expect(Object.keys(mod.helpers)).toEqual(["fee"]);
    expect(mod.helperReturnTypes.fee).toBe("number");
    expect(mod.helperHasArgs.fee).toBe(true);
    expect(mod.helperArgDefs.fee).toEqual([{ name: "amount", type: "number" }]);
    expect(mod.constants).toEqual({});
  });

  it("helper wrappers declare 3 params so resolveHelper treats them as eager", async () => {
    const defs = new Map<string, DefValue>([
      [
        "@fee",
        {
          kind: "helper",
          run: (async () => "42") as any,
          argDefs: [],
          bodyNode: {} as any,
        },
      ],
    ]);
    const mod = new EvmlModule("m", "m", defs, fakeContext());
    const helper = await resolveHelper(mod.helpers.fee);
    expect(await helper(mod, {} as any, stubInterpreters)).toBe("42");
  });

  it("binds sibling defs scope-locally during a run and cleans up after", async () => {
    const ctx = fakeContext();
    const bm = ctx.bindingsManager;

    let siblingDuringRun: unknown;
    const defs = new Map<string, DefValue>();
    defs.set(
      "main",
      commandDef(async (module: any) => {
        siblingDuringRun = module.bindingsManager.getBindingValue(
          "other",
          BindingsSpace.DEF,
        );
        return [];
      }),
    );
    defs.set(
      "other",
      commandDef(async () => []),
    );

    const mod = new EvmlModule("m", "m", defs, ctx);
    const cmd = mod.commands.main as any;
    await cmd.run(mod, { name: "main", args: [], opts: [] }, stubInterpreters);

    expect(siblingDuringRun).toBeDefined();
    expect(bm.getBindingValue("other", BindingsSpace.DEF)).toBeUndefined();
    expect(bm.getBindingValue("main", BindingsSpace.DEF)).toBeUndefined();
  });

  it("propagates the module execution origin into nested interpretation", async () => {
    const seen: any[] = [];
    const probing: NodesInterpreters = {
      interpretNode: async (_n, options) => {
        seen.push(options?.origin);
        return undefined;
      },
      interpretNodes: async () => [],
    };

    const defs = new Map<string, DefValue>();
    defs.set(
      "main",
      commandDef(async (_m: any, _c: any, interpreters: NodesInterpreters) => {
        seen.push(interpreters.origin);
        await interpreters.interpretNode({} as any);
        await interpreters.interpretNode({} as any, {
          blockInitializer: undefined,
        });
        return [];
      }),
    );

    const mod = new EvmlModule("aliased", "canonical", defs, fakeContext());
    const cmd = mod.commands.main as any;
    await cmd.run(mod, { name: "main", args: [], opts: [] }, probing);

    expect(seen).toEqual([
      { kind: "module", module: "canonical" },
      { kind: "module", module: "canonical" },
      { kind: "module", module: "canonical" },
    ]);
  });
});

describe("normalizeModuleSource", () => {
  it("passes plain EVML text through", () => {
    const src = "module m (\n  def greet () (\n    print 'hi'\n  )\n)";
    expect(normalizeModuleSource(src)).toBe(src);
  });

  it("unwraps JSON-quoted strings (pinJSONToIPFS convention)", () => {
    expect(normalizeModuleSource('"module m (\\n)"')).toBe("module m (\n)");
  });

  it("uses the script field of unencrypted share pins", () => {
    expect(
      normalizeModuleSource('{"title":"t","script":"module m (\\n)"}'),
    ).toBe("module m (\n)");
  });

  it("rejects encrypted share envelopes with a targeted error", () => {
    expect(() =>
      normalizeModuleSource('{"encrypted":true,"iv":"...","data":"..."}'),
    ).toThrow(/encrypted share link/);
  });

  it("returns raw text when it merely looks like JSON", () => {
    const notJson = "{ this is not json }";
    expect(normalizeModuleSource(notJson)).toBe(notJson);
  });
});

describe("IPFSResolver.text", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("fetches text and caches successful results by cid", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response("module m (\n)", { status: 200 });
    }) as any;

    const resolver = new IPFSResolver();
    expect(await resolver.text("QmTest")).toBe("module m (\n)");
    expect(await resolver.text("QmTest")).toBe("module m (\n)");
    expect(calls).toBe(1);
  });

  it("does not cache failures", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response("nope", { status: 404, statusText: "Not Found" });
    }) as any;

    const resolver = new IPFSResolver();
    await expect(resolver.text("QmMiss")).rejects.toThrow(/404/);
    await expect(resolver.text("QmMiss")).rejects.toThrow(/404/);
    expect(calls).toBe(2);
  });
});
