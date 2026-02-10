import { beforeAll, describe, it } from "bun:test";
import { expect } from "chai";
import "../../../setup.js";

import {
  type Action,
  BindingsSpace,
  CommandError,
  encodeAction,
  isBatchedAction,
  isTransactionAction,
  toDecimals,
} from "@evmcrispr/sdk";
import type { PublicClient, WalletClient } from "viem";
import { toHex } from "viem";
import { gnosis } from "viem/chains";
import { EVMcrispr } from "../../../../src/EVMcrispr";
import {
  getPublicClient,
  getWalletClients,
} from "../../../test-helpers/client.js";
import { TEST_ACCOUNT_ADDRESS } from "../../../test-helpers/constants.js";
import {
  createInterpreter,
  itChecksNonDefinedIdentifier,
} from "../../../test-helpers/evml.js";
import { expectThrowAsync } from "../../../test-helpers/expects.js";
import { findStdCommandNode } from "../../../test-helpers/std.js";

describe("Std > commands > exec <target> <fnSignature> [<...params>] [--from <sender>]", () => {
  let client: PublicClient;

  beforeAll(async () => {
    client = getPublicClient();
  });

  const target = "0x44fA8E6f47987339850636F88629646662444217"; // DAI
  const params = ["0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6", "1200e18"];
  const resolvedParams = [
    "0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6",
    toDecimals(1200, 18),
  ];
  const fnSig = "approve(address,uint256)";

  it("should return a correct exec action", async () => {
    const interpreter = createInterpreter(
      `exec ${target} ${fnSig} ${params.join(" ")}`,
      client,
    );

    const result = await interpreter.interpret();

    const expectedCallAction: Action[] = [
      encodeAction(target, fnSig, resolvedParams),
    ];

    expect(result).eql(expectedCallAction);
  });

  it("should return a correct exec action with value", async () => {
    const interpreter = createInterpreter(
      `exec ${target} ${fnSig} ${params.join(" ")} --value 1e18`,
      client,
    );

    const result = await interpreter.interpret();

    const expectedCallAction: Action[] = [
      encodeAction(target, fnSig, resolvedParams, {
        value: 1000000000000000000n,
      }),
    ];

    expect(result).eql(expectedCallAction);
  });

  it("should return a correct exec action with from address", async () => {
    const interpreter = createInterpreter(
      `exec ${target} ${fnSig} ${params.join(" ")} --from ${target}`,
      client,
    );

    const result = await interpreter.interpret();

    const expectedCallAction: Action[] = [
      encodeAction(target, fnSig, resolvedParams, { from: target }),
    ];

    expect(result).eql(expectedCallAction);
  });

  it("should return a correct exec action with value and from address", async () => {
    const interpreter = createInterpreter(
      `exec ${target} ${fnSig} ${params.join(
        " ",
      )} --value 1e18 --from ${target}`,
      client,
    );

    const result = await interpreter.interpret();

    const expectedCallAction: Action[] = [
      encodeAction(target, fnSig, resolvedParams, {
        value: 1000000000000000000n,
        from: target,
      }),
    ];

    expect(result).eql(expectedCallAction);
  });

  it("should return a correct exec action when having to implicitly convert any string parameter to bytes when expecting one", async () => {
    const targetAddress = "0xd0e81E3EE863318D0121501ff48C6C3e3Fd6cbc7";
    const params = [
      ["0x02732126661d25c59fd1cc2308ac883b422597fc3103f285f382c95d51cbe667"],
      "QmTik4Zd7T5ALWv5tdMG8m2cLiHmqtTor5QmnCSGLUjLU2",
    ];
    const interpreter = createInterpreter(
      `exec ${targetAddress} addBatches(bytes32[],bytes) [${params[0].toString()}] ${
        params[1]
      }`,
      client,
    );

    const actActions = await interpreter.interpret();

    const expectedActActions: Action[] = [
      encodeAction(targetAddress, "addBatches(bytes32[],bytes)", [
        params[0],
        toHex("QmTik4Zd7T5ALWv5tdMG8m2cLiHmqtTor5QmnCSGLUjLU2"),
      ]),
    ];
    expect(actActions).to.be.eql(expectedActActions);
  });

  it("should return exec action when receiving just the method's name", async () => {
    const interpreter = createInterpreter(
      `
        exec ${target} transfer @me 1500e18
        `,
      client,
    );

    const callActions = await interpreter.interpret();

    const expectedCallActions: Action[] = [
      encodeAction(
        "0xf8d1677c8a0c961938bf2f9adc3f3cfda759a9d9",
        "transfer(address,uint256)",
        [TEST_ACCOUNT_ADDRESS, toDecimals(1500)],
      ),
    ];

    expect(callActions).to.eql(expectedCallActions);
  });

  itChecksNonDefinedIdentifier(
    "should fail when receiving a non-defined target identifier",
    (nonDefinedIdentifier) =>
      createInterpreter(
        `
        exec ${nonDefinedIdentifier} "${fnSig}" 1e18
      `,
        client,
      ),
    "exec",
    0,
  );

  it("should fail when receiving an invalid target address", async () => {
    const invalidTargetAddress = "false";
    const interpreter = createInterpreter(
      `exec ${invalidTargetAddress} ${fnSig} 1e18`,
      client,
    );
    const c = findStdCommandNode(interpreter.ast, "exec")!;
    const error = new CommandError(
      c,
      `<contractAddress> must be a valid address, got ${invalidTargetAddress}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when providing an invalid signature", async () => {
    const invalidSignature = "invalid(uint256,)";
    const interpreter = createInterpreter(
      `
        exec ${target} ${invalidSignature} 1e18`,
      client,
    );
    const c = findStdCommandNode(interpreter.ast, "exec")!;
    const error = new CommandError(c, `invalid signature "invalid(uint256,)"`);

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it.todo("should fail when providing a method's name whose contract ABI isn't found", () => {});

  it.todo("should fail when providing an ABI duplicated method's name", () => {});

  it.todo("should fail when providing a method's name of a contract which isn't verified", () => {});

  it("should fail when providing invalid call params", async () => {
    const paramErrors = [
      `-param 0 of type address: Address "false" is invalid.\n\n- Address must be a hex value of 20 bytes. Got false`,
    ];
    const interpreter = createInterpreter(
      `exec ${target} ${fnSig} false 1e18`,
      client,
    );
    const c = findStdCommandNode(interpreter.ast, "exec")!;
    const error = new CommandError(
      c,
      `error when encoding approve call:\n${paramErrors.join("\n")}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when providing invalid value parameter", async () => {
    const interpreter = createInterpreter(
      `exec ${target} ${fnSig} @me 1e18 --value tata`,
      client,
    );
    const c = findStdCommandNode(interpreter.ast, "exec")!;
    const error = new CommandError(c, `--value must be a number, got tata`);

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when providing invalid from address", async () => {
    const interpreter = createInterpreter(
      `exec ${target} ${fnSig} @me 1e18 --from tata`,
      client,
    );
    const c = findStdCommandNode(interpreter.ast, "exec")!;
    const error = new CommandError(
      c,
      `--from must be a valid address, got tata`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  describe("event capture", () => {
    let walletClient: WalletClient;

    beforeAll(() => {
      walletClient = getWalletClients()[0];
    });

    it("should capture event value and use it in a subsequent transaction", async () => {
      const script = `
        set $wxdai 0xe91d153e0b41518a2ce8dd3d7944fa863463a97d
        exec $wxdai deposit() --value 0.001e18 -> Deposit(address indexed,uint):1 $amount
        exec $wxdai withdraw(uint) $amount
      `;

      const account = walletClient.account!;
      const evm = new EVMcrispr(client, account.address);

      const actionCallback = async (action: Action) => {
        if (isTransactionAction(action)) {
          const hash = await walletClient.sendTransaction({
            account: walletClient.account!,
            chain: gnosis,
            to: action.to,
            data: action.data,
            value: action.value,
          });
          return await client.waitForTransactionReceipt({ hash });
        }
        throw new Error(`Unexpected action type`);
      };

      await evm.interpret(script, actionCallback);

      // If we got here without error, the event was captured and the
      // withdraw succeeded using the captured $amount value.
      // Verify the variable was set correctly.
      const amount = evm.getBinding("$amount", BindingsSpace.USER);
      expect(amount).to.equal("1000000000000000");
    });

    it("should capture event value from a batch command", async () => {
      const script = `
set $wxdai 0xe91d153e0b41518a2ce8dd3d7944fa863463a97d
batch (
  exec $wxdai deposit() --value 0.001e18
  exec $wxdai withdraw(uint) 0.001e18
) -> Deposit(address indexed,uint):1 $amount
      `;

      const account = walletClient.account!;
      const evm = new EVMcrispr(client, account.address);

      const actionCallback = async (action: Action) => {
        if (isTransactionAction(action)) {
          const hash = await walletClient.sendTransaction({
            account: walletClient.account!,
            chain: gnosis,
            to: action.to,
            data: action.data,
            value: action.value,
          });
          return await client.waitForTransactionReceipt({ hash });
        }
        if (isBatchedAction(action)) {
          // Execute each action in the batch and aggregate logs
          const allLogs: any[] = [];
          for (const txAction of action.actions) {
            const hash = await walletClient.sendTransaction({
              account: walletClient.account!,
              chain: gnosis,
              to: txAction.to,
              data: txAction.data,
              value: txAction.value,
            });
            const receipt = await client.waitForTransactionReceipt({ hash });
            allLogs.push(...receipt.logs);
          }
          return { logs: allLogs };
        }
        throw new Error(`Unexpected action type`);
      };

      await evm.interpret(script, actionCallback);

      // Verify the $amount was captured from the Deposit event
      const amount = evm.getBinding("$amount", BindingsSpace.USER);
      expect(amount).to.equal("1000000000000000");
    });
  });
});
