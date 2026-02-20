import "../../setup";
import { beforeAll, describe, it } from "bun:test";

import type AragonOS from "@evmcrispr/module-aragonos";
import { buildNonceForAddress } from "@evmcrispr/module-aragonos/utils/nonces";

import {
  type Address,
  addressesEqual,
  BindingsSpace,
  CommandError,
  type TransactionAction,
} from "@evmcrispr/sdk";
import {
  createInterpreter,
  expect,
  expectThrowAsync,
  getPublicClient,
  getWalletClients,
} from "@evmcrispr/test-utils";
import type { PublicClient, WalletClient } from "viem";
import { getContract, getContractAddress, parseAbi } from "viem";
import { DAO, DAO2 } from "../../fixtures";
import {
  createAragonScriptInterpreter as createAragonScriptInterpreter_,
  findAragonOSCommandNode,
} from "../../test-helpers/aragonos";

describe("AragonOS > commands > new-token <$var> <name> <symbol> <controller> [decimals = 18] [transferable = true]", () => {
  let client: PublicClient;
  let walletClient: WalletClient;

  let createAragonScriptInterpreter: ReturnType<
    typeof createAragonScriptInterpreter_
  >;

  beforeAll(async () => {
    client = getPublicClient();
    [walletClient] = getWalletClients();

    createAragonScriptInterpreter = createAragonScriptInterpreter_(
      client,
      DAO.kernel,
    );
  });

  it("should return a correct new token action", async () => {
    const interpreter = await createAragonScriptInterpreter([
      `new-token $token "my-token" MT @nextApp`,
    ]);

    const actions = await interpreter.interpret();

    const aragonos = interpreter.getModule("aragonos") as AragonOS;

    const tx1 = await walletClient.sendTransaction({
      ...(actions[0] as TransactionAction),
      chain: undefined,
      account: walletClient.account!,
    });
    await client.waitForTransactionReceipt({ hash: tx1 });

    const tx2 = await walletClient.sendTransaction({
      ...(actions[1] as TransactionAction),
      chain: undefined,
      account: walletClient.account!,
    });
    await client.waitForTransactionReceipt({ hash: tx2 });

    const tokenAddr = aragonos.bindingsManager.getBindingValue(
      `$token`,
      BindingsSpace.USER,
    )! as Address;

    const expectedControllerAddr = getContractAddress({
      from: DAO.kernel,
      nonce: await buildNonceForAddress(DAO.kernel, 0, client!),
    });

    const token = getContract({
      address: tokenAddr,
      abi: parseAbi(["function controller() view returns (address)"]),
      client,
    });

    expect(
      addressesEqual(await token.read.controller(), expectedControllerAddr),
    ).to.be.true;
  });

  it("should return a correct new token action given a different DAO", async () => {
    const interpreter = createInterpreter(
      `
        load aragonos --as ar

        ar:connect ${DAO.kernel} (
          connect ${DAO2.kernel} (
            new-token $token "my-token" MT @nextApp
          )
        )
      `,
      client,
    );

    const actions = await interpreter.interpret();

    const aragonos = interpreter.getModule("aragonos") as AragonOS;

    const tx1 = await walletClient.sendTransaction({
      ...(actions[0] as TransactionAction),
      chain: undefined,
      account: walletClient.account!,
    });
    await client.waitForTransactionReceipt({ hash: tx1 });

    const tx2 = await walletClient.sendTransaction({
      ...(actions[1] as TransactionAction),
      chain: undefined,
      account: walletClient.account!,
    });
    await client.waitForTransactionReceipt({ hash: tx2 });

    const tokenAddr = aragonos.bindingsManager.getBindingValue(
      `$token`,
      BindingsSpace.USER,
    )! as Address;

    const expectedControllerAddr = getContractAddress({
      from: DAO2.kernel,
      nonce: await buildNonceForAddress(DAO2.kernel, 0, client!),
    });

    const token = getContract({
      address: tokenAddr,
      abi: parseAbi(["function controller() view returns (address)"]),
      client,
    });

    expect(
      addressesEqual(await token.read.controller(), expectedControllerAddr),
    ).to.be.true;
  });

  it("should return a correct new token action when it is not connected to a DAO", async () => {
    const controllerAddr = `0xf762d8c9ea241a72a0b322a28e96155a03566acd`;

    const interpreter = createInterpreter(
      `
        load aragonos --as ar
        ar:new-token $token "my-token" MT ${controllerAddr}
      `,
      client,
    );

    const newTokenActions = await interpreter.interpret();

    const aragonos = interpreter.getModule("aragonos") as AragonOS;
    const tx1 = await walletClient.sendTransaction({
      ...(newTokenActions[0] as TransactionAction),
      chain: undefined,
      account: walletClient.account!,
    });

    await client.waitForTransactionReceipt({ hash: tx1 });

    const tx2 = await walletClient.sendTransaction({
      ...(newTokenActions[1] as TransactionAction),
      chain: undefined,
      account: walletClient.account!,
    });

    await client.waitForTransactionReceipt({ hash: tx2 });

    const tokenAddr = aragonos.bindingsManager.getBindingValue(
      `$token`,
      BindingsSpace.USER,
    )! as Address;

    const token = getContract({
      address: tokenAddr,
      abi: parseAbi(["function controller() view returns (address)"]),
      client,
    });

    expect(addressesEqual(await token.read.controller(), controllerAddr)).to.be
      .true;
  });

  it("should fail when passing an invalid token decimals value", async () => {
    const invalidDecimals = "invalidDecimals";
    const interpreter = createAragonScriptInterpreter([
      `new-token $token "a new token" ANT @nextApp ${invalidDecimals}`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, "new-token")!;
    const error = new CommandError(
      c,
      `[decimals] must be a number, got ${invalidDecimals}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when passing an invalid controller", async () => {
    const invalidController = "false";
    const interpreter = createAragonScriptInterpreter([
      `new-token $token "a new token" ANT ${invalidController}`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, "new-token")!;
    const error = new CommandError(
      c,
      `<controller> must be a valid address, got ${invalidController}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when passing an invalid transferable flag", async () => {
    const invalidTransferable = "an-invalid-value";
    const interpreter = createAragonScriptInterpreter([
      `new-token $token "a new token" ANT @nextApp 18 ${invalidTransferable}`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, "new-token")!;
    const error = new CommandError(
      c,
      `[transferable] must be a boolean, got ${invalidTransferable}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });
});
