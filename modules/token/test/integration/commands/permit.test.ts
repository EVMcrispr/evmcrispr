import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import { type Action, isWalletAction } from "@evmcrispr/sdk";
import { expect, getTransports, getWalletClients } from "@evmcrispr/test-utils";
import { describeCommand, evml, Interpreter } from "@evmcrispr/test-utils/evml";
import type { WalletClient } from "viem";
import {
  decodeFunctionData,
  maxUint256,
  parseAbi,
  recoverTypedDataAddress,
  serializeSignature,
} from "viem";
import { gnosis } from "viem/chains";
import { GNO, SDAI, SOME_ADDRESS, WXDAI } from "../../fixtures";

const PERMIT_ABI = parseAbi([
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
]);

describeCommand("permit", {
  describeName:
    "Token > commands > permit <amount> <token> for <spender> [--deadline <ts>]",
  module: "token",
  preamble: "load token",
  errorCases: [
    {
      name: "should fail when no execution context is available",
      script: `token:permit 100e18 ${GNO} for ${SOME_ADDRESS}`,
      error: "requires an execution context with wallet access",
    },
  ],
});

describe("Token > commands > permit > with wallet", () => {
  let walletClient: WalletClient;

  beforeAll(() => {
    walletClient = getWalletClients()[0];
  });

  /** Interpreter wired to a wallet that answers eth_signTypedData_v4,
   *  capturing the typed data the command asked to sign. */
  function createRunner() {
    const account = walletClient.account!;
    const evm = new Interpreter(evml.registry, {
      account: account.address,
      transports: getTransports(),
    });
    evm.switchChainId(gnosis.id);

    let typedData: any;
    const actionCallback = async (action: Action) => {
      if (isWalletAction(action) && action.method === "eth_signTypedData_v4") {
        typedData = JSON.parse(action.params[1]);
        return walletClient.signTypedData({
          account,
          domain: typedData.domain,
          types: { Permit: typedData.types.Permit },
          primaryType: "Permit",
          message: {
            ...typedData.message,
            value: BigInt(typedData.message.value),
            nonce: BigInt(typedData.message.nonce),
            deadline: BigInt(typedData.message.deadline),
          },
        });
      }
      // Transaction actions are inspected via interpret()'s return value
      return undefined;
    };

    return { account, evm, actionCallback, getTypedData: () => typedData };
  }

  it("should encode a valid permit call for an EIP-2612 token exposing version()", async () => {
    const { account, evm, actionCallback, getTypedData } = createRunner();

    const actions = await evm.interpret(
      `load token
token:permit 100e18 ${GNO} for ${SOME_ADDRESS} --deadline 1800000000`,
      actionCallback,
    );

    expect(actions).to.have.length(1);
    const action = actions[0] as { to: string; data: `0x${string}` };
    expect(action.to).to.equal(GNO);

    const typedData = getTypedData();
    expect(typedData.domain).to.eql({
      name: "Gnosis Token on xDai",
      version: "1",
      chainId: 100,
      verifyingContract: GNO,
    });

    const { functionName, args } = decodeFunctionData({
      abi: PERMIT_ABI,
      data: action.data,
    });
    expect(functionName).to.equal("permit");
    const [owner, spender, value, deadline, v, r, s] = args;
    expect(owner).to.equal(account.address);
    expect(spender).to.equal(SOME_ADDRESS);
    expect(value).to.equal(100000000000000000000n);
    expect(deadline).to.equal(1800000000n);

    // The v/r/s encoded on-chain must recover to the connected account
    const recovered = await recoverTypedDataAddress({
      domain: typedData.domain,
      types: { Permit: typedData.types.Permit },
      primaryType: "Permit",
      message: {
        ...typedData.message,
        value: BigInt(typedData.message.value),
        nonce: BigInt(typedData.message.nonce),
        deadline: BigInt(typedData.message.deadline),
      },
      signature: serializeSignature({ r, s, v: BigInt(v) }),
    });
    expect(recovered).to.equal(account.address);
  });

  it("should default the deadline to max uint256", async () => {
    const { evm, actionCallback } = createRunner();

    const actions = await evm.interpret(
      `load token
token:permit 100e18 ${GNO} for ${SOME_ADDRESS}`,
      actionCallback,
    );

    const { args } = decodeFunctionData({
      abi: PERMIT_ABI,
      data: (actions[0] as { data: `0x${string}` }).data,
    });
    expect(args[3]).to.equal(maxUint256);
  });

  it("should resolve the domain through eip712Domain() (EIP-5267)", async () => {
    const { evm, actionCallback, getTypedData } = createRunner();

    const actions = await evm.interpret(
      `load token
token:permit 100e18 ${SDAI} for ${SOME_ADDRESS}`,
      actionCallback,
    );

    expect(actions).to.have.length(1);
    const typedData = getTypedData();
    expect(typedData.domain).to.eql({
      name: "Savings xDAI",
      version: "1",
      chainId: 100,
      verifyingContract: SDAI,
    });
  });

  it("should reject tokens without EIP-2612 support", async () => {
    const { evm, actionCallback } = createRunner();

    let error: Error | undefined;
    try {
      await evm.interpret(
        `load token
token:permit 100e18 ${WXDAI} for ${SOME_ADDRESS}`,
        actionCallback,
      );
    } catch (err) {
      error = err as Error;
    }
    expect(error?.message ?? "").to.include("does not support EIP-2612");
  });
});
