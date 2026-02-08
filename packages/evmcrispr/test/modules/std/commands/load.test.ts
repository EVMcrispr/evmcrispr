import { beforeAll, describe, it } from "bun:test";
import { expect } from "chai";
import "../../../setup.js";

import type { PublicClient } from "viem";
import { CommandError } from "../../../../src/errors";
import { Ens } from "../../../../src/modules/ens/Ens";
import type { CommandExpressionNode } from "../../../../src/types";
import { getPublicClient } from "../../../test-helpers/client.js";
import { createInterpreter } from "../../../test-helpers/evml";
import { expectThrowAsync } from "../../../test-helpers/expects";
import { findStdCommandNode } from "../../../test-helpers/std";

describe("Std > commands > load <name> [as <alias>]", () => {
  let client: PublicClient;

  beforeAll(async () => {
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
    const interpreter = createInterpreter("load ens as e", client);

    await interpreter.interpret();

    const module = interpreter.getModule("ens");

    expect(module?.alias).to.be.equal("e");
  });

  it("should fail when trying to load a non-existent module", async () => {
    const moduleName = "nonExistent";
    const interpreter = createInterpreter(`load ${moduleName}`, client);
    const c = findStdCommandNode(interpreter.ast, "load")!;
    const error = new CommandError(c, `module ${moduleName} not found`);

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when trying to load a previously loaded module", async () => {
    const moduleName = "ens";
    const interpreter = createInterpreter(
      `
    load ${moduleName}
    load ${moduleName}
  `,
      client,
    );
    const c = interpreter.ast.body[1] as CommandExpressionNode;
    const error = new CommandError(c, `module ${moduleName} already loaded`);

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it.todo("should throw an error when trying to load a module with an alias previously used", () => {});
});
