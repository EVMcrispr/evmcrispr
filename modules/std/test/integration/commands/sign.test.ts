import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import { EVMcrispr } from "@evmcrispr/core";
import {
  type Action,
  BindingsSpace,
  isWalletAction,
} from "@evmcrispr/sdk";
import {
  describeCommand,
  expect,
  getPublicClient,
  getWalletClients,
} from "@evmcrispr/test-utils";
import type { PublicClient, WalletClient } from "viem";
import { gnosis } from "viem/chains";

describeCommand("sign", {
  describeName: "Std > commands > sign <$variable> <message> [--typed <json>]",
  errorCases: [
    {
      name: "should fail when the first argument is not a variable identifier",
      script: 'sign notavar "hello"',
      error: "<variable> must be a $variable",
    },
    {
      name: "should fail when sign receives wrong argument count (no message)",
      script: "sign $sig",
      error: "sign expects exactly 2 arguments",
    },
    {
      name: "should fail when --typed receives extra arguments",
      script: `sign $sig "extra" --typed '{"types":{}}'`,
      error: "sign --typed expects exactly 1 argument",
    },
    {
      name: "should fail when no execution context is available for personal_sign",
      script: 'sign $sig "hello"',
      error: "sign requires an execution context with wallet access",
    },
    {
      name: "should fail when no execution context is available for typed sign",
      script: `sign $sig --typed '{"types":{}}'`,
      error: "sign requires an execution context with wallet access",
    },
  ],
});

describe("Std > commands > sign > with wallet", () => {
  let client: PublicClient;
  let walletClient: WalletClient;

  beforeAll(() => {
    client = getPublicClient();
    walletClient = getWalletClients()[0];
  });

  it("should sign a personal message and store the signature", async () => {
    const script = 'sign $sig "hello world"';
    const account = walletClient.account!;
    const evm = new EVMcrispr(client, account.address);

    const actionCallback = async (action: Action) => {
      if (isWalletAction(action) && action.method === "personal_sign") {
        return walletClient.signMessage({
          account,
          message: action.params[0],
        });
      }
      throw new Error("Unexpected action type");
    };

    await evm.interpret(script, actionCallback);

    const sig = evm.getBinding("$sig", BindingsSpace.USER);
    expect(sig).to.be.a("string");
    expect((sig as string).startsWith("0x")).to.be.true;
    expect((sig as string).length).to.equal(132);
  });

  it("should sign typed data and store the signature", async () => {
    const typedData = JSON.stringify({
      types: {
        EIP712Domain: [{ name: "name", type: "string" }],
        Test: [{ name: "value", type: "uint256" }],
      },
      primaryType: "Test",
      domain: { name: "Test" },
      message: { value: 42 },
    });

    const script = `sign $sig --typed '${typedData}'`;
    const account = walletClient.account!;
    const evm = new EVMcrispr(client, account.address);

    const actionCallback = async (action: Action) => {
      if (
        isWalletAction(action) &&
        action.method === "eth_signTypedData_v4"
      ) {
        const parsed = JSON.parse(action.params[1]);
        return walletClient.signTypedData({
          account,
          ...parsed,
        });
      }
      throw new Error("Unexpected action type");
    };

    await evm.interpret(script, actionCallback);

    const sig = evm.getBinding("$sig", BindingsSpace.USER);
    expect(sig).to.be.a("string");
    expect((sig as string).startsWith("0x")).to.be.true;
  });
});
