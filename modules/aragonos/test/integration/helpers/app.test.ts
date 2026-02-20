import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import {
  createInterpreter,
  expect,
  getPublicClient,
} from "@evmcrispr/test-utils";
import type { PublicClient } from "viem";
import { DAO, DAO2 } from "../../fixtures";

describe("AragonOS > helpers > @app(appIdentifier)", () => {
  let client: PublicClient;

  beforeAll(() => {
    client = getPublicClient();
  });

  it("should resolve an app address within the current DAO", async () => {
    const interpreter = createInterpreter(
      `
      load aragonos --as ar
      ar:connect ${DAO.kernel} (
        set $addr @app(agent)
      )
      `,
      client,
    );
    await interpreter.interpret();
  });

  it("should resolve an app with a DAO address prefix", async () => {
    const interpreter = createInterpreter(
      `
      load aragonos --as ar
      ar:connect ${DAO.kernel} (
        connect ${DAO2.kernel} (
          set $addr @app(_${DAO.kernel}:agent)
        )
      )
      `,
      client,
    );
    await interpreter.interpret();
  });

  it("should fail when the app does not exist in the DAO", async () => {
    const interpreter = createInterpreter(
      `
      load aragonos --as ar
      ar:connect ${DAO.kernel} (
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

  it("should fail when the DAO prefix does not match any connected DAO", async () => {
    const fakeDAO = "0x0000000000000000000000000000000000000001";
    const interpreter = createInterpreter(
      `
      load aragonos --as ar
      ar:connect ${DAO.kernel} (
        set $addr @app(_${fakeDAO}:agent)
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
});
