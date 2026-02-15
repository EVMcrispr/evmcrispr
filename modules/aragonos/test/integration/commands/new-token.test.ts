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
import type { PublicClient, WalletClient } from "viem";
import { getContract, getContractAddress, parseAbi } from "viem";
import { DAO, DAO2 } from "../../fixtures";
import {
  expect,
  expectThrowAsync,
  getPublicClient,
  getWalletClients,
} from "@evmcrispr/test-utils";
import { createInterpreter } from "../../test-helpers/evml";
import {
  createAragonScriptInterpreter as createAragonScriptInterpreter_,
  findAragonOSCommandNode,
} from "../../test-helpers/aragonos";

describe("AragonOS > commands > new-token <name> <symbol> <controller> [decimals = 18] [transferable = true]", () => {
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
    const params = ["my-token", "MT", "token-manager.open:counter-factual-tm"];

    const interpreter = await createAragonScriptInterpreter([
      `new-token ${params.join(" ")}`,
      `set $token token:MT`,
      `set $controller token-manager.open:counter-factual-tm`,
    ]);

    const newTokenActions = await interpreter.interpret();

    const aragonos = interpreter.getModule("aragonos") as AragonOS;
    const tx1 = await walletClient.sendTransaction({
      ...(newTokenActions[0] as TransactionAction),
      // Used to avoid typescript errors
      chain: undefined,
      account: walletClient.account!,
    });

    await client.waitForTransactionReceipt({ hash: tx1 });

    const tx2 = await walletClient.sendTransaction({
      ...(newTokenActions[1] as TransactionAction),
      // Used to avoid typescript errors
      chain: undefined,
      account: walletClient.account!,
    });

    await client.waitForTransactionReceipt({ hash: tx2 });

    const tokenAddr = aragonos.bindingsManager.getBindingValue(
      `$token`,
      BindingsSpace.USER,
    )! as Address;

    const tokenManagerAddr = aragonos.bindingsManager.getBindingValue(
      `$controller`,
      BindingsSpace.USER,
    )! as Address;

    const token = getContract({
      address: tokenAddr,
      abi: parseAbi(["function controller() view returns (address)"]),
      client,
    });

    expect(addressesEqual(await token.read.controller(), tokenManagerAddr)).to
      .be.true;
  });

  it("should return a correct new token action given a different DAO", async () => {
    const params = [
      "my-token",
      "MT",
      `_${DAO.kernel}:token-manager.open:counter-factual-tm`,
    ];

    const interpreter = createInterpreter(
      `
        load aragonos --as ar

        ar:connect ${DAO.kernel} (
          connect ${DAO2.kernel} (
            new-token ${params.join(" ")}
            set $token token:MT
            set $controller _${DAO.kernel}:token-manager.open:counter-factual-tm
          )
        )
      `,
      client,
    );

    const newTokenActions = await interpreter.interpret();

    const aragonos = interpreter.getModule("aragonos") as AragonOS;
    const tx1 = await walletClient.sendTransaction({
      ...(newTokenActions[0] as TransactionAction),
      // Used to avoid typescript errors
      chain: undefined,
      account: walletClient.account!,
    });

    await client.waitForTransactionReceipt({ hash: tx1 });

    const tx2 = await walletClient.sendTransaction({
      ...(newTokenActions[1] as TransactionAction),
      // Used to avoid typescript errors
      chain: undefined,
      account: walletClient.account!,
    });

    await client.waitForTransactionReceipt({ hash: tx2 });

    const tokenAddr = aragonos.bindingsManager.getBindingValue(
      `$token`,
      BindingsSpace.USER,
    )! as Address;

    const tokenManagerAddr = aragonos.bindingsManager.getBindingValue(
      `$controller`,
      BindingsSpace.USER,
    )! as Address;

    const token = getContract({
      address: tokenAddr,
      abi: parseAbi(["function controller() view returns (address)"]),
      client,
    });
    const addr = getContractAddress({
      from: DAO.kernel,
      nonce: await buildNonceForAddress(DAO.kernel, 0, client!),
    });

    expect(addressesEqual(addr, tokenManagerAddr)).to.be.true;
    expect(addressesEqual(await token.read.controller(), tokenManagerAddr)).to
      .be.true;
  });

  it("should return a correct new token action when it is not connected to a DAO", async () => {
    const params: [string, string, Address] = [
      "my-token",
      "MT",
      `0xf762d8c9ea241a72a0b322a28e96155a03566acd`,
    ];

    const interpreter = createInterpreter(
      `
        load aragonos --as ar
        ar:new-token ${params.join(" ")}
        set $token token:MT
      `,
      client,
    );

    const newTokenActions = await interpreter.interpret();

    const aragonos = interpreter.getModule("aragonos") as AragonOS;
    const tx1 = await walletClient.sendTransaction({
      ...(newTokenActions[0] as TransactionAction),
      // Used to avoid typescript errors
      chain: undefined,
      account: walletClient.account!,
    });

    await client.waitForTransactionReceipt({ hash: tx1 });

    const tx2 = await walletClient.sendTransaction({
      ...(newTokenActions[1] as TransactionAction),
      // Used to avoid typescript errors
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

    expect(addressesEqual(await token.read.controller(), params[2])).to.be.true;
  });

  it('should fail when executing it using a conterfactual app outside a "connect" command', async () => {
    const interpreter = createInterpreter(
      `
      load aragonos --as ar

      ar:new-token "a new token" ANT token-manager.open:counter-factual-tm
    `,
      client,
    );
    const c = interpreter.ast.body[1];
    const error = new CommandError(
      c,
      "invalid controller. Expected a labeled app identifier witin a connect command for token-manager.open:counter-factual-tm",
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when passing an invalid token decimals value", async () => {
    const invalidDecimals = "invalidDecimals";
    const interpreter = createAragonScriptInterpreter([
      `new-token "a new token" ANT token-manager.open:counter-factual-tm ${invalidDecimals}`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, "new-token")!;
    const error = new CommandError(
      c,
      `[decimals] must be a number, got ${invalidDecimals}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when passing an invalid controller", async () => {
    const invalidController = "asd:123-asd&45";
    const interpreter = createAragonScriptInterpreter([
      `new-token "a new token" ANT ${invalidController}`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, "new-token")!;
    const error = new CommandError(
      c,
      `invalid controller. Expected an address or an app identifier, but got ${invalidController}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when passing an invalid transferable flag", async () => {
    const invalidTransferable = "an-invalid-value";
    const interpreter = createAragonScriptInterpreter([
      `new-token "a new token" ANT token-manager.open:counter-factual-tm 18 ${invalidTransferable}`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, "new-token")!;
    const error = new CommandError(
      c,
      `[transferable] must be a boolean, got ${invalidTransferable}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });
});
