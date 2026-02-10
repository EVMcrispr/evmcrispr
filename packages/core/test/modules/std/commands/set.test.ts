import { beforeAll, describe, it } from "bun:test";
import { expect } from "chai";
import "../../../setup.js";

import { BindingsSpace, CommandError, toDecimals } from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import { getPublicClient } from "../../../test-helpers/client.js";
import { createInterpreter } from "../../../test-helpers/evml.js";
import { expectThrowAsync } from "../../../test-helpers/expects.js";
import { findStdCommandNode } from "../../../test-helpers/std.js";

describe("Std > commands > set <varName> <varValue>", () => {
  let client: PublicClient;

  beforeAll(async () => {
    client = getPublicClient();
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
