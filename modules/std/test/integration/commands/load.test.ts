import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import Ens from "@evmcrispr/module-ens";
import {
  createInterpreter,
  expect,
  getPublicClient,
} from "@evmcrispr/test-utils";
import type { PublicClient } from "viem";

describe("Std > commands > load <name> [--as <alias>]", () => {
  let client: PublicClient;

  beforeAll(() => {
    client = getPublicClient();
  });

  it("should load a module correctly", async () => {
    const moduleName = "ens";
    const interpreter = createInterpreter(`load ${moduleName}`, client);
    await interpreter.interpret();

    const modules = interpreter.getAllModules();
    const module = modules.find((m) => m.name === moduleName);

    expect(modules.length, "total modules length mismatch").to.be.equal(2);
    expect(module, "module doesn't exists").to.exist;
    expect(module?.name, "module name mismatch").to.equals(moduleName);
    expect(module, "module class mismatch").instanceOf(Ens);
  });

  it("should set an alias for a module correctly", async () => {
    const interpreter = createInterpreter("load ens --as e", client);
    await interpreter.interpret();

    const module = interpreter.getModule("ens");
    expect(module?.alias).to.be.equal("e");
  });

  it("should fail when trying to load a non-existent module", async () => {
    const interpreter = createInterpreter("load nonExistent", client);
    try {
      await interpreter.interpret();
      throw new Error("Expected interpret to throw");
    } catch (err: any) {
      expect(err.message).to.include("module nonExistent not found");
    }
  });

  it("should fail when trying to load a previously loaded module", async () => {
    const interpreter = createInterpreter("load ens\nload ens", client);
    try {
      await interpreter.interpret();
      throw new Error("Expected interpret to throw");
    } catch (err: any) {
      expect(err.message).to.include("module ens already loaded");
    }
  });

  it.todo("should throw an error when trying to load a module with an alias previously used", () => {});
});
