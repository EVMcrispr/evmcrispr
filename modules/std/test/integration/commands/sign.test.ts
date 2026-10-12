import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import { type Action, BindingsSpace, isWalletAction } from "@evmcrispr/sdk";
import { expect, getTransports, getWalletClients } from "@evmcrispr/test-utils";
import { describeCommand, evml, Interpreter } from "@evmcrispr/test-utils/evml";
import type { WalletClient } from "viem";
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
  let walletClient: WalletClient;

  beforeAll(() => {
    walletClient = getWalletClients()[0];
  });

  it("should sign a personal message and store the signature", async () => {
    const script = 'sign $sig "hello world"';
    const account = walletClient.account!;
    const evm = new Interpreter(evml.registry, {
      account: account.address,
      transports: getTransports(),
    });
    evm.switchChainId(gnosis.id);

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

  it("should produce a personal-message signature that @sigValid accepts", async () => {
    const script = `sign $sig "hello world"
set $ok @sigValid(@me "hello world" $sig)`;
    const account = walletClient.account!;
    const evm = new Interpreter(evml.registry, {
      account: account.address,
      transports: getTransports(),
    });
    evm.switchChainId(gnosis.id);

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

    expect(evm.getBinding("$ok", BindingsSpace.USER)).to.equal("true");
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
    const evm = new Interpreter(evml.registry, {
      account: account.address,
      transports: getTransports(),
    });
    evm.switchChainId(gnosis.id);

    const actionCallback = async (action: Action) => {
      if (isWalletAction(action) && action.method === "eth_signTypedData_v4") {
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

  it("should produce a typed-data signature that @sigValid accepts", async () => {
    const typedData = JSON.stringify({
      types: {
        EIP712Domain: [{ name: "name", type: "string" }],
        Test: [{ name: "value", type: "uint256" }],
      },
      primaryType: "Test",
      domain: { name: "Test" },
      message: { value: 42 },
    });

    const script = `sign $sig --typed '${typedData}'
set $ok @sigValid(@me '${typedData}' $sig)`;
    const account = walletClient.account!;
    const evm = new Interpreter(evml.registry, {
      account: account.address,
      transports: getTransports(),
    });
    evm.switchChainId(gnosis.id);

    const actionCallback = async (action: Action) => {
      if (isWalletAction(action) && action.method === "eth_signTypedData_v4") {
        const parsed = JSON.parse(action.params[1]);
        return walletClient.signTypedData({
          account,
          ...parsed,
        });
      }
      throw new Error("Unexpected action type");
    };

    await evm.interpret(script, actionCallback);

    expect(evm.getBinding("$ok", BindingsSpace.USER)).to.equal("true");
  });
});

describe("Std > commands > sign > under switch --as", () => {
  const WHO = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const CONNECTED = "0x1234567890abcdef1234567890abcdef12345678";

  /** Runs `script` with a host that records what it is asked to sign. */
  const run = async (script: string, account: `0x${string}` | undefined) => {
    const evm = new Interpreter(evml.registry, {
      account,
      chainId: gnosis.id,
      transports: getTransports(),
    });
    const asked: Action[] = [];
    await evm.interpret(script, async (action) => {
      asked.push(action);
      return "0xsigned";
    });
    return asked.filter(isWalletAction);
  };

  it("with no account connected, asks the --as account for a personal signature", async () => {
    const asked = await run(
      `switch --as ${WHO} (\n  sign $sig "hello"\n)`,
      undefined,
    );
    expect(asked).to.eql([
      { type: "wallet", method: "personal_sign", params: ["hello", WHO] },
    ]);
  });

  it("with no account connected, asks the --as account for a typed signature", async () => {
    const typed = JSON.stringify({
      types: { Test: [{ name: "value", type: "uint256" }] },
      primaryType: "Test",
      domain: { name: "Test" },
      message: { value: "1" },
    });
    const asked = await run(
      `switch --as ${WHO}\nsign $sig --typed '${typed}'`,
      undefined,
    );
    expect(asked).to.have.length(1);
    expect(asked[0].method).to.eq("eth_signTypedData_v4");
    expect(asked[0].params[0]).to.eq(WHO);
  });

  it("with another account connected, stops at the switch and asks for nothing", async () => {
    const asked: Action[] = [];
    const evm = new Interpreter(evml.registry, {
      account: CONNECTED,
      chainId: gnosis.id,
      transports: getTransports(),
    });
    let error: Error | undefined;
    try {
      await evm.interpret(
        `switch --as ${WHO} (\n  sign $sig "hello"\n)`,
        async (action) => {
          asked.push(action);
          return "0xsigned";
        },
      );
    } catch (err) {
      error = err as Error;
    }
    expect(error?.message).to.include(
      "switch --as 0x7099...79C8: the connected account is 0x1234...5678",
    );
    expect(asked).to.eql([]);
  });

  it("in a simulation, signing is refused whoever acts", async () => {
    let error: Error | undefined;
    try {
      await run(
        `load sim\nsim:fork --using ethereumjs --as ${WHO} (\n  sign $sig "hello"\n)`,
        CONNECTED,
      );
    } catch (err) {
      error = err as Error;
    }
    expect(error?.message).to.include(
      "sign cannot request wallet signatures during simulation",
    );
  }, 120000);
});
