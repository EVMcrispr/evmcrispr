import { expect } from "chai";
import { viem } from "hardhat";

import type { PublicClient } from "viem";
import { CommandError } from "../../../../src/errors";
import { BindingsSpace } from "../../../../src/types";
import { toDecimals } from "../../../../src/utils";
import { createInterpreter } from "../../../test-helpers/evml";
import { expectThrowAsync } from "../../../test-helpers/expects";
import { findStdCommandNode } from "../../../test-helpers/std";

describe("Std > commands > set <varName> <varValue>", () => {
  let client: PublicClient;

  before(async () => {
    client = await viem.getPublicClient();
  });

  it("should set an user variable correctly", async () => {
    const interpreter = createInterpreter("set $var 1e18", client);

    await interpreter.interpret();

    expect(interpreter.getBinding("$var", BindingsSpace.USER)).to.be.equal(
      toDecimals(1, 18),
    );
  });

  it("should fail when setting an invalid variable identifier", async () => {
    const interpreter = createInterpreter(
      `
   set var1 12e18
  `,
      client,
    );
    const c = findStdCommandNode(interpreter.ast, "set")!;
    const error = new CommandError(c, "expected a variable identifier");

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should update the value when setting an already-defined variable", async () => {
    const interpreter = createInterpreter(
      `
        set $var1 12e18
        set $var1 "new"
      `,
      client,
    );

    await interpreter.interpret();

    expect(interpreter.getBinding("$var1", BindingsSpace.USER)).to.be.equal(
      "new",
    );
  });
});
