import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import { BindingsSpace } from "@evmcrispr/sdk";
import {
  createInterpreter,
  expect,
  getPublicClient,
} from "@evmcrispr/test-utils";
import type { PublicClient } from "viem";
import { isAddress } from "viem";
import { DAO } from "../../fixtures";

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
