import "../../setup";
import { beforeAll, describe, it } from "bun:test";

import { describeCommand } from "@evmcrispr/test-utils/evml";

describeCommand("new-dao", {
  module: "aragonos",
  describeName: "AragonOS > commands > new-dao > doc examples",
  docCases: [
    {
      description: "Create a new DAO",
      code: `aragonos:new-dao $dao "my-dao"`,
    },
  ],
});

import type AragonOS from "@evmcrispr/module-aragonos";
import {
  type Action,
  BindingsSpace,
  isTransactionAction,
  type TransactionAction,
} from "@evmcrispr/sdk";
import { expect, getPublicClient, getTransports, getWalletClients } from "@evmcrispr/test-utils";
import { createInterpreter, EVMcrispr } from "@evmcrispr/test-utils/evml";
import type { Address, PublicClient, WalletClient } from "viem";
import { decodeAbiParameters, isAddressEqual, parseAbiParameters } from "viem";
import { gnosis } from "viem/chains";

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
        aragonos.bindingsManager.getBindingValue(
          "$dao",
          BindingsSpace.USER,
        ) as Address,
        newDAOAddress,
      ),
      "new DAO binding mismatch",
    ).to.be.true;
  });
});

function createActionCallback(
  wc: WalletClient,
  pc: PublicClient,
): (action: Action) => Promise<any> {
  return async (action: Action) => {
    if (!isTransactionAction(action)) {
      throw new Error("Unexpected action type");
    }
    const hash = await wc.sendTransaction({
      account: wc.account!,
      chain: gnosis,
      to: action.to,
      data: action.data,
      value: action.value,
      gas: 5_000_000n,
    });
    return pc.waitForTransactionReceipt({ hash });
  };
}

describe("AragonOS > commands > new-dao > event capture", () => {
  let client: PublicClient;
  let walletClient: WalletClient;

  beforeAll(() => {
    client = getPublicClient();
    [walletClient] = getWalletClients();
  });

  it("should capture DeployDAO event address from new-dao command", async () => {
    const evm = new EVMcrispr(walletClient.account!.address, getTransports());
    evm.switchChainId(gnosis.id);
    const actionCallback = createActionCallback(walletClient, client);

    await evm.interpret(
      `load aragonos --as ar
       ar:new-dao $dao "capture-test-dao" -> DeployDAO(address) [$daoAddr]`,
      actionCallback,
    );

    const daoBinding = evm.getBinding("$dao", BindingsSpace.USER) as Address;
    const capturedAddr = evm.getBinding(
      "$daoAddr",
      BindingsSpace.USER,
    ) as Address;

    expect(capturedAddr).to.not.be.undefined;
    expect(isAddressEqual(daoBinding, capturedAddr)).to.be.true;
  });
});
