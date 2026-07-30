import "../../setup";
import { expect as bunExpect, describe, it } from "bun:test";
import {
  type Action,
  BindingsSpace,
  isWalletAction,
  type Num,
} from "@evmcrispr/sdk";
import { expect, getTransports, getWalletClients } from "@evmcrispr/test-utils";
import { describeCommand, evml, Interpreter } from "@evmcrispr/test-utils/evml";
import { gnosis } from "viem/chains";
import { IDENTITY_MESSAGE } from "../../../src/utils/identity";
import { ANVIL0_COMMITMENT } from "../../fixtures/vectors";

describe("Semaphore > commands > identity <$variable>", () => {
  it("derives the identity from the wallet signature (deterministic per wallet)", async () => {
    const walletClient = getWalletClients()[0];
    const account = walletClient.account!;
    const evm = new Interpreter(evml.registry, {
      account: account.address,
      transports: getTransports(),
    });
    evm.switchChainId(gnosis.id);

    const signed: string[] = [];
    const actionCallback = async (action: Action) => {
      if (isWalletAction(action) && action.method === "personal_sign") {
        signed.push(action.params[0]);
        return walletClient.signMessage({ account, message: action.params[0] });
      }
      return undefined;
    };

    await evm.interpret(
      "load semaphore\nsemaphore:identity $id",
      actionCallback,
    );
    bunExpect(signed).toEqual([IDENTITY_MESSAGE]);
    const bound = evm.getBinding("$id", BindingsSpace.USER) as Num;
    expect(bound.toBigInt()).to.equal(ANVIL0_COMMITMENT);
  });
});

describeCommand("identity", {
  module: "semaphore",
  preamble: "load semaphore",
  describeName: "Semaphore > commands > identity (no wallet)",
  errorCases: [
    {
      name: "should fail without an execution context",
      script: "semaphore:identity $id",
      error: "requires an execution context with wallet access",
    },
  ],
});
