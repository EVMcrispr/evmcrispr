import "../../setup";
import { beforeAll, describe, it } from "bun:test";

import type AragonOS from "@evmcrispr/module-aragonos";
import {
  BindingsSpace,
  type TransactionAction,
} from "@evmcrispr/sdk";
import {
  createInterpreter,
  expect,
  getPublicClient,
  getWalletClients,
} from "@evmcrispr/test-utils";
import type { PublicClient, WalletClient } from "viem";
import { decodeAbiParameters, isAddressEqual, parseAbiParameters } from "viem";

describe("AragonOS > commands > new-dao <daoName>", () => {
  let client: PublicClient;
  let walletClient: WalletClient;

  beforeAll(async () => {
    client = getPublicClient();
    [walletClient] = getWalletClients();
  });

  it("should create a new dao correctly", async () => {
    const daoName = "my-evmcrispr-dao";
    const interpreter = createInterpreter(
      `
      load aragonos --as ar

      ar:new-dao $dao ${daoName}
    `,
      client,
    );

    const newDAOActions = await interpreter.interpret();

    const txHash = await walletClient.sendTransaction({
      ...(newDAOActions[0] as TransactionAction),
      // Used to avoid typescript errors
      chain: undefined,
      account: walletClient.account!,
    });

    const aragonos = interpreter.getModule("aragonos") as AragonOS;

    const receipt = await client.waitForTransactionReceipt({ hash: txHash });

    const lastLog = receipt.logs.pop();

    expect(lastLog).to.not.be.undefined;

    const newDAOAddress = decodeAbiParameters(
      parseAbiParameters("address"),
      lastLog!.data,
    )[0];

    expect(
      isAddressEqual(
        aragonos.bindingsManager.getBindingValue("$dao", BindingsSpace.USER)!,
        newDAOAddress,
      ),
      "new DAO binding mismatch",
    ).to.be.true;
  });
});
