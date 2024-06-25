import { expect } from "chai";
import type { Signer } from "ethers";
import { ethers } from "hardhat";

import { BindingsSpace } from "../../../../src/types";
import { CommandError } from "../../../../src/errors";
import { toDecimals } from "../../../../src/utils";
import { createInterpreter } from "../../../test-helpers/cas11";
import { expectThrowAsync } from "../../../test-helpers/expects";
import { findStdCommandNode } from "../../../test-helpers/std";

describe("Std > commands > set <varName> <varValue>", () => {
  let signer: Signer;

  before(async () => {
    [signer] = await ethers.getSigners();
  });

  it("should set an user variable correctly", async () => {
    const interpreter = createInterpreter("set $var 1e18", signer);

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
      signer,
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
      signer,
    );

    await interpreter.interpret();

    expect(interpreter.getBinding("$var1", BindingsSpace.USER)).to.be.equal(
      "new",
    );
  });
});
