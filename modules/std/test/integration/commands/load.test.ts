import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import { createInterpreter, describeCommand } from "@evmcrispr/test-utils/evml";
import type { PublicClient } from "viem";

describeCommand("load", {
  describeName: "Std > commands > load > doc examples",
  docCases: [
    { description: "Load the simulation module", code: `load sim` },
    {
      description:
        "Import selected names for unqualified use (barewords = commands, @names = helpers)",
      code: `load ens [renew @addr]`,
    },
    {
      description: "Rename an import with >",
      code: `load ens [set-addr>ens-set-addr @contenthash>@ch]`,
    },
  ],
});

describe("Std > commands > load <name> [imports]", () => {
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
    expect(module, "module class mismatch").to.have.property(
      "name",
      moduleName,
    );
  });

  it("should make module helpers available qualified after a plain load", async () => {
    const interpreter = createInterpreter(
      'load ens\nset $res @ens:contenthash("ipfs:QmRAQB6YaCyidP37UdDnjFY5vQuiBrcqdyoW1CuDgwxkD4")',
      client,
    );
    await interpreter.interpret();
  });

  it("should allow unqualified use of an imported helper", async () => {
    const interpreter = createInterpreter(
      'load ens [@contenthash]\nset $res @contenthash("ipfs:QmRAQB6YaCyidP37UdDnjFY5vQuiBrcqdyoW1CuDgwxkD4")',
      client,
    );
    await interpreter.interpret();
  });

  it("should allow renaming an imported helper with >", async () => {
    const interpreter = createInterpreter(
      'load ens [@contenthash>@ch]\nset $res @ch("ipfs:QmRAQB6YaCyidP37UdDnjFY5vQuiBrcqdyoW1CuDgwxkD4")',
      client,
    );
    await interpreter.interpret();
  });

  it("should not resolve unqualified helpers that were not imported", async () => {
    const interpreter = createInterpreter(
      'load ens\nset $res @contenthash("ipfs:QmRAQB6YaCyidP37UdDnjFY5vQuiBrcqdyoW1CuDgwxkD4")',
      client,
    );
    try {
      await interpreter.interpret();
      throw new Error("Expected interpret to throw");
    } catch (err: any) {
      expect(err.message).to.include("helper @contenthash not found");
    }
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

  it("should fail when the import list is not a literal array", async () => {
    const interpreter = createInterpreter("load ens renew", client);
    try {
      await interpreter.interpret();
      throw new Error("Expected interpret to throw");
    } catch (err: any) {
      expect(err.message).to.include("import list must be a literal array");
    }
  });

  it("should fail when importing a non-existent command", async () => {
    const interpreter = createInterpreter("load ens [nonExistent]", client);
    try {
      await interpreter.interpret();
      throw new Error("Expected interpret to throw");
    } catch (err: any) {
      expect(err.message).to.include(
        "module ens has no command named nonExistent",
      );
    }
  });

  it("should fail when importing a non-existent helper", async () => {
    const interpreter = createInterpreter("load ens [@nonExistent]", client);
    try {
      await interpreter.interpret();
      throw new Error("Expected interpret to throw");
    } catch (err: any) {
      expect(err.message).to.include(
        "module ens has no helper or constant named @nonExistent",
      );
    }
  });

  it("should fail on duplicate imports", async () => {
    const interpreter = createInterpreter(
      "load ens [@contenthash @contenthash]",
      client,
    );
    try {
      await interpreter.interpret();
      throw new Error("Expected interpret to throw");
    } catch (err: any) {
      expect(err.message).to.include("duplicate import @contenthash");
    }
  });

  it("should fail when an import collides with an existing import", async () => {
    const interpreter = createInterpreter(
      "load ens [renew]\nload aragonos [connect>renew]",
      client,
    );
    try {
      await interpreter.interpret();
      throw new Error("Expected interpret to throw");
    } catch (err: any) {
      expect(err.message).to.include(
        "import renew collides with an existing import",
      );
    }
  });
});
