import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import { BindingsSpace } from "@evmcrispr/sdk";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import { createInterpreter, describeHelper } from "@evmcrispr/test-utils/evml";
import type { PublicClient } from "viem";
import { isAddress } from "viem";
import { DAO } from "../../fixtures";

describeHelper("@nextApp", {
  module: "aragonos",
  describeName: "AragonOS > helpers > @nextApp > doc examples",
  docCases: [
    {
      description: "Predict the next app address",
      code: "aragonos:connect 0x1fc7e8d8e4bbbef77a4d035aec189373b52125a8 (\n  set $next @nextApp\n  print $next\n)",
    },
  ],
});

describe("AragonOS > helpers > @nextApp(offset?)", () => {
  let client: PublicClient;

  beforeAll(() => {
    client = getPublicClient();
  });

  it("should return a valid address for the next app", async () => {
    const interpreter = createInterpreter(
      `
      load aragonos --as ar
      ar:connect ${DAO.kernel} (
        set $addr @nextApp
      )
      `,
      client,
    );

    await interpreter.interpret();
    const addr = interpreter.getBinding("$addr", BindingsSpace.USER);
    expect(isAddress(addr as string)).to.be.true;
  });
});
