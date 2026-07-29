import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import { BindingsSpace } from "@evmcrispr/sdk";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import { createInterpreter, describeHelper } from "@evmcrispr/test-utils/evml";
import type { PublicClient } from "viem";
import { DAO } from "../../fixtures";

describeHelper("@aragonos:app", {
  module: "aragonos",
  describeName: "AragonOS > helpers > @app > doc examples",
  docCases: [
    {
      description: "Resolve app address within a DAO",
      code: "aragonos:connect 0x1fc7e8d8e4bbbef77a4d035aec189373b52125a8 (\n  set $agent @aragonos:app(agent)\n  print $agent\n)",
    },
  ],
});

describe("AragonOS > helpers > @app(appIdentifier)", () => {
  let client: PublicClient;

  beforeAll(() => {
    client = getPublicClient();
  });

  it("should resolve an app address within the current DAO", async () => {
    const interpreter = createInterpreter(
      `
      load aragonos [@app]
      aragonos:connect ${DAO.kernel} (
        set $addr @app(agent)
      )
      `,
      client,
    );
    await interpreter.interpret();
  });

  it("should resolve a later instance with an index argument", async () => {
    const interpreter = createInterpreter(
      `
      load aragonos [@app]
      aragonos:connect ${DAO.kernel} (
        set $addr @app(agent 2)
      )
      `,
      client,
    );
    await interpreter.interpret();

    const aragonos = interpreter.getModule("aragonos");
    expect(aragonos).to.not.be.undefined;
    expect(
      aragonos!.bindingsManager.getBindingValue("$addr", BindingsSpace.USER),
    ).to.equal(DAO["agent:2"]);
  });

  it("should fail when the app does not exist in the DAO", async () => {
    const interpreter = createInterpreter(
      `
      load aragonos [@app]
      aragonos:connect ${DAO.kernel} (
        set $addr @app(nonexistent-app)
      )
      `,
      client,
    );

    try {
      await interpreter.interpret();
      throw new Error("Expected interpret to throw");
    } catch (err: any) {
      expect(err.message).to.include("not found");
    }
  });

  it("should fail when the index is out of range", async () => {
    const interpreter = createInterpreter(
      `
      load aragonos [@app]
      aragonos:connect ${DAO.kernel} (
        set $addr @app(agent 9)
      )
      `,
      client,
    );

    try {
      await interpreter.interpret();
      throw new Error("Expected interpret to throw");
    } catch (err: any) {
      expect(err.message).to.include("instance");
    }
  });
});
