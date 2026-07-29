import "../../setup";

import { afterEach, beforeEach, describe, it } from "bun:test";
import { defineCommand, defineHelper, defineModule } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";

import type { ParseDiagnostic } from "../../../src";
import { createEvml, type EvmlTag } from "../../../src";
import { ModuleRegistry } from "../../../src/evml/registry";

const savedEnv = process.env.VITE_PUBLIC_EXPERIMENTAL;
const setEnv = (value: string | undefined) => {
  if (value === undefined) delete process.env.VITE_PUBLIC_EXPERIMENTAL;
  else process.env.VITE_PUBLIC_EXPERIMENTAL = value;
};

afterEach(() => setEnv(savedEnv));

const StableModule = defineModule("stable", {
  noop: {
    load: async () => ({
      default: defineCommand({ name: "noop", args: [], run: async () => [] }),
    }),
  },
});

// Defined with the env forced OFF so the experimental helper lands in
// `experimentalHelpers` (defineModule filters at definition time).
function makeMixedModule() {
  return defineModule(
    "mixed",
    {},
    {
      exph: {
        load: async () => ({
          default: defineHelper({
            name: "exph",
            experimental: true,
            args: [],
            run: async () => "ok",
          }),
        }),
        experimental: true,
      },
    },
  );
}

describe("evml > experimental gating", () => {
  describe("ModuleRegistry", () => {
    let registry: ModuleRegistry;

    beforeEach(() => {
      registry = new ModuleRegistry();
      registry.register(
        "exp",
        async () => ({ default: StableModule }),
        "an experimental module",
        true,
      );
      registry.register("plain", async () => ({ default: StableModule }));
    });

    it("hides experimental modules while disabled", () => {
      setEnv(undefined);
      expect(registry.has("exp")).to.be.false;
      expect(registry.get("exp")).to.be.undefined;
      expect(registry.names()).to.eql(["plain"]);
      expect(registry.allNames()).to.eql(["exp", "plain"]);
      expect(registry.experimentalNames()).to.eql(["exp"]);
      expect(registry.isExperimental("exp")).to.be.true;
    });

    it("exposes them when enabled (checked at call time)", () => {
      setEnv("true");
      expect(registry.has("exp")).to.be.true;
      expect(registry.get("exp")).to.be.a("function");
      expect(registry.names()).to.eql(["exp", "plain"]);
    });
  });

  describe("execution", () => {
    let tag: EvmlTag;

    beforeEach(() => {
      tag = createEvml();
      tag.use({
        name: "expmod",
        load: async () => ({ default: StableModule }),
        experimental: true,
      });
    });

    it("load <experimental-module> fails with a clear error while disabled", async () => {
      setEnv(undefined);
      let error: Error | undefined;
      try {
        await tag.script("load expmod").interpret();
      } catch (e) {
        error = e as Error;
      }
      expect(error?.message).to.match(
        /"expmod" is experimental and not enabled/,
      );
    });

    it("load <experimental-module> works when enabled", async () => {
      setEnv("true");
      await tag.script("load expmod").interpret();
    });
  });

  describe("diagnostics", () => {
    let tag: EvmlTag;

    const semantic = async (script: string): Promise<ParseDiagnostic[]> =>
      (await tag.workspace().getFullDiagnostics(script)).filter(
        (d) => d.source === "semantic",
      );

    beforeEach(() => {
      tag = createEvml();
      tag.use({
        name: "expmod",
        load: async () => ({ default: StableModule }),
        experimental: true,
      });
    });

    it("reports experimental-disabled instead of unknown-module", async () => {
      setEnv(undefined);
      const ds = await semantic("load expmod");
      expect(ds.map((d) => d.code)).to.include("experimental-disabled");
      expect(ds[0].message).to.match(/VITE_PUBLIC_EXPERIMENTAL/);
    });

    it("accepts the module when enabled", async () => {
      setEnv("true");
      const ds = await semantic("load expmod");
      expect(ds).to.eql([]);
    });

    it("reports experimental-disabled for a hidden helper", async () => {
      setEnv(undefined);
      const mixedTag = createEvml();
      mixedTag.use({
        name: "mixed",
        load: async () => ({ default: makeMixedModule() }),
      });
      const ds = (
        await mixedTag
          .workspace()
          .getFullDiagnostics("load mixed\nprint @mixed:exph()")
      ).filter((d) => d.source === "semantic");
      expect(ds.map((d) => d.code)).to.include("experimental-disabled");
      expect(ds[0].message).to.match(/@exph.*experimental/);
    });

    it("reports experimental-disabled for the load --from option", async () => {
      setEnv(undefined);
      const ds = await semantic('load ghostmod --from "ipfs://cid"');
      expect(ds.map((d) => d.code)).to.include("experimental-disabled");
      expect(
        ds.find((d) => d.code === "experimental-disabled")?.message,
      ).to.match(/--from/);
    });
  });

  describe("completions", () => {
    it("omits experimental module names and options while disabled", async () => {
      setEnv(undefined);
      const tag = createEvml();
      tag.use({
        name: "expmod",
        load: async () => ({ default: StableModule }),
        experimental: true,
      });

      const moduleItems = await tag
        .workspace()
        .getCompletions("load ", { line: 1, col: 5 });
      expect(moduleItems.map((c) => c.label)).to.not.include("expmod");

      const optItems = await tag
        .workspace()
        .getCompletions("load expmod --", { line: 1, col: 14 });
      expect(optItems.map((c) => c.label)).to.not.include("--from");
    });

    it("offers them when enabled", async () => {
      setEnv("true");
      const tag = createEvml();
      tag.use({
        name: "expmod",
        load: async () => ({ default: StableModule }),
        experimental: true,
      });

      const moduleItems = await tag
        .workspace()
        .getCompletions("load ", { line: 1, col: 5 });
      expect(moduleItems.map((c) => c.label)).to.include("expmod");

      const optItems = await tag
        .workspace()
        .getCompletions("load expmod --", { line: 1, col: 14 });
      expect(optItems.map((c) => c.label)).to.include("--from");
    });
  });
});
