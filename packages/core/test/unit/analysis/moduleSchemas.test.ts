import { describe, expect, it } from "bun:test";
import type { ModuleData } from "@evmcrispr/sdk";
import { BindingsManager, BindingsSpace } from "@evmcrispr/sdk";

import { ModuleSchemaProvider } from "../../../src/analysis/moduleSchemas";

const throwingLoader = () => {
  throw new Error("must not be dynamically imported");
};

function provider(data: Partial<ModuleData>): ModuleSchemaProvider {
  const cache = new BindingsManager();
  cache.setBinding(
    "mod",
    { commands: {}, helpers: {}, ...data } as ModuleData,
    BindingsSpace.MODULE,
    false,
  );
  return new ModuleSchemaProvider(cache, ["mod"]);
}

describe("ModuleSchemaProvider registry metadata", () => {
  describe("getHelperBatchable", () => {
    it("reads a declared false flag from registry metadata without loading the helper", async () => {
      const p = provider({
        helpers: { reader: throwingLoader as never },
        helperBatchable: { reader: false },
      });
      expect(await p.getHelperBatchable("mod", "reader")).toBe(false);
    });

    it("falls back to dynamically importing when no metadata is recorded", async () => {
      const fn = async () => "ok";
      (fn as any).batchable = false;
      const p = provider({
        helpers: { legacy: () => Promise.resolve(fn as never) },
      });
      expect(await p.getHelperBatchable("mod", "legacy")).toBe(false);
    });

    it("returns undefined for an unknown helper", async () => {
      const p = provider({});
      expect(await p.getHelperBatchable("mod", "ghost")).toBeUndefined();
    });
  });

  describe("getHelperOnchain", () => {
    it("finds the `name!` sibling via the helperOnchain map", () => {
      const p = provider({
        helpers: {
          reader: throwingLoader as never,
          "reader!": throwingLoader as never,
        },
        helperOnchain: { "reader!": true },
      });
      expect(p.getHelperOnchain("mod", "reader")).toBe(true);
      // A full `name!` query resolves the same sibling.
      expect(p.getHelperOnchain("mod", "reader!")).toBe(true);
    });

    it("falls back to the presence of the `name!` registry key", () => {
      const p = provider({
        helpers: { "legacy!": throwingLoader as never },
      });
      expect(p.getHelperOnchain("mod", "legacy")).toBe(true);
    });

    it("is false for run-only helpers and unknown modules", () => {
      const p = provider({ helpers: { plain: throwingLoader as never } });
      expect(p.getHelperOnchain("mod", "plain")).toBe(false);
      expect(p.getHelperOnchain("ghost", "plain")).toBe(false);
    });
  });
});
