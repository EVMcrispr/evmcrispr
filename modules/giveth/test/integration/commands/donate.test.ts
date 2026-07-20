import "../../setup";
import { beforeAll, beforeEach, describe, it } from "bun:test";
import { type Action, isWalletAction } from "@evmcrispr/sdk";
import { expect, getTransports, getWalletClients } from "@evmcrispr/test-utils";
import { describeCommand, evml, Interpreter } from "@evmcrispr/test-utils/evml";
import type { WalletClient } from "viem";
import { decodeFunctionData, parseAbi } from "viem";
import { gnosis } from "viem/chains";
import {
  DONATION_HANDLER,
  PROJECT_RECIPIENT,
  TIP_RECIPIENT,
  WXDAI,
  ZERO_ADDRESS,
} from "../../fixtures";
import { recordedDonations, recordedLogins } from "../../fixtures/msw-handlers";

const donationHandlerAbi = parseAbi([
  "function donateETH(address recipientAddress, uint256 amount, bytes data)",
  "function donateManyETH(uint256 totalAmount, address[] recipientAddresses, uint256[] amounts, bytes[] data)",
  "function donateERC20(address tokenAddress, address recipientAddress, uint256 amount, bytes data)",
  "function donateManyERC20(address tokenAddress, uint256 totalAmount, address[] recipientAddresses, uint256[] amounts, bytes[] data)",
]);
const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

describeCommand("donate", {
  describeName:
    "Giveth > commands > donate <amount|[amounts]> <token> to <slug|[slugs]>",
  module: "giveth",
  preamble: "load giveth",
  errorCases: [
    {
      name: "should fail without the `to` keyword",
      script: `giveth:donate 100e18 ${WXDAI} evmcrispr`,
      error: "invalid number of arguments",
    },
    {
      name: "should fail on a wrong connector keyword",
      script: `giveth:donate 100e18 ${WXDAI} into evmcrispr`,
      error: 'expected keyword "to", got "into"',
    },
    {
      name: "should fail on several amounts for a single project",
      script: `giveth:donate [1e18 2e18] ${WXDAI} to evmcrispr`,
      error:
        "<amount> must be a single number when donating to a single project",
    },
    {
      name: "should fail when amounts don't match the projects",
      script: `giveth:donate [1e18] ${WXDAI} to [evmcrispr wayback-machine]`,
      error: "<amounts> length (1) does not match <projects> length (2)",
    },
    {
      name: "should fail on duplicate slugs",
      script: `giveth:donate [1e18 1e18] ${WXDAI} to [evmcrispr evmcrispr]`,
      error: "<projects> contains duplicate slugs",
    },
    {
      name: "should fail on a zero amount",
      script: `giveth:donate 0 ${WXDAI} to evmcrispr`,
      error: "<amount> must be greater than zero",
    },
    {
      name: "should reject tips above 100 percent",
      script: `giveth:donate 1e18 ${WXDAI} to evmcrispr --tip 150`,
      error: "--tip must be a percentage between 0 and 100",
    },
    {
      name: "should fail on chains without a DonationHandler",
      script: `switch 1101\ngiveth:donate [1e18] ${WXDAI} to [evmcrispr]`,
      error: "the Giveth donation handler is not deployed on chain 1101",
    },
    {
      name: "should fail without an execution context",
      script: `giveth:donate 100e18 ${WXDAI} to evmcrispr`,
      error: "donate requires an execution context with wallet access",
    },
  ],
});

describe("Giveth > commands > donate > with wallet", () => {
  let walletClient: WalletClient;

  beforeAll(() => {
    walletClient = getWalletClients()[0];
  });

  beforeEach(() => {
    recordedDonations.length = 0;
    recordedLogins.length = 0;
  });

  const fakeHash = (i: number) => `0x${i.toString(16).padStart(64, "0")}`;

  const runDonate = async (script: string) => {
    const account = walletClient.account!;
    const evm = new Interpreter(evml.registry, {
      account: account.address,
      transports: getTransports(),
    });
    evm.switchChainId(gnosis.id);

    const executed: Action[] = [];
    const actionCallback = async (action: Action) => {
      if (isWalletAction(action) && action.method === "personal_sign") {
        return walletClient.signMessage({
          account,
          message: action.params[0],
        });
      }
      executed.push(action);
      return { transactionHash: fakeHash(executed.length) };
    };

    await evm.interpret(`load giveth\n${script}`, actionCallback);
    return executed;
  };

  it("donates to a single project with a direct transfer and records it", async () => {
    const executed = await runDonate(
      `giveth:donate 100e18 ${WXDAI} to evmcrispr`,
    );

    expect(executed).to.have.length(1);
    const transfer = executed[0] as any;
    expect(transfer.to).to.eq(WXDAI);
    expect(transfer.chainId).to.eq(gnosis.id);
    const decoded = decodeFunctionData({ abi: erc20Abi, data: transfer.data });
    expect(decoded.functionName).to.eq("transfer");
    expect(decoded.args).to.eql([PROJECT_RECIPIENT, 100n * 10n ** 18n]);

    expect(recordedLogins).to.have.length(1);
    expect(recordedDonations).to.have.length(1);
    expect(recordedDonations[0]).to.include({
      transactionId: fakeHash(1),
      transactionNetworkId: gnosis.id,
      amount: 100,
      token: "WXDAI",
      tokenAddress: WXDAI,
      projectId: 1350,
      anonymous: false,
    });
  });

  it("donates the native token directly with a plain value transfer", async () => {
    const executed = await runDonate(
      `giveth:donate 5e18 ${ZERO_ADDRESS} to evmcrispr`,
    );

    expect(executed).to.have.length(1);
    const send = executed[0] as any;
    expect(send.to).to.eq(PROJECT_RECIPIENT);
    expect(send.value).to.eq(5n * 10n ** 18n);
    expect(send.data).to.be.undefined;

    expect(recordedDonations).to.have.length(1);
    expect(recordedDonations[0]).to.include({
      amount: 5,
      token: gnosis.nativeCurrency.symbol,
      tokenAddress: ZERO_ADDRESS,
    });
  });

  it("donates to several projects through the DonationHandler and records each", async () => {
    const executed = await runDonate(
      `giveth:donate [30e18 70e18] ${WXDAI} to [evmcrispr wayback-machine]`,
    );

    // WXDAI allowance for the handler starts at 0 on the fork → approve first.
    expect(executed).to.have.length(2);
    const [approve, donateMany] = executed as any[];
    const approveDecoded = decodeFunctionData({
      abi: erc20Abi,
      data: approve.data,
    });
    expect(approveDecoded.functionName).to.eq("approve");
    expect(approveDecoded.args).to.eql([DONATION_HANDLER, 100n * 10n ** 18n]);

    expect(donateMany.to).to.eq(DONATION_HANDLER);
    const decoded = decodeFunctionData({
      abi: donationHandlerAbi,
      data: donateMany.data,
    });
    expect(decoded.functionName).to.eq("donateManyERC20");
    expect(decoded.args).to.eql([
      WXDAI,
      100n * 10n ** 18n,
      [PROJECT_RECIPIENT, PROJECT_RECIPIENT],
      [30n * 10n ** 18n, 70n * 10n ** 18n],
      ["0x", "0x"],
    ]);

    // Both records share the handler tx hash (the approve consumed hash 1).
    expect(recordedDonations).to.have.length(2);
    expect(recordedDonations[0]).to.include({
      transactionId: fakeHash(2),
      amount: 30,
      projectId: 1350,
    });
    expect(recordedDonations[1]).to.include({
      transactionId: fakeHash(2),
      amount: 70,
      projectId: 2000,
    });
  });

  it("broadcasts a single amount to every project via the contract", async () => {
    const executed = await runDonate(
      `giveth:donate 2e18 ${ZERO_ADDRESS} to [evmcrispr wayback-machine]`,
    );

    expect(executed).to.have.length(1);
    const decoded = decodeFunctionData({
      abi: donationHandlerAbi,
      data: (executed[0] as any).data,
    });
    expect(decoded.functionName).to.eq("donateManyETH");

    expect(recordedDonations.map((d) => d.amount)).to.eql([2, 2]);
    expect(recordedDonations[0]!.transactionId).to.eq(
      recordedDonations[1]!.transactionId,
    );
  });

  it("simulates inside sim:fork without signing in or recording to Giveth", async () => {
    const account = walletClient.account!;
    const evm = new Interpreter(evml.registry, {
      account: account.address,
      transports: getTransports(),
    });
    evm.switchChainId(gnosis.id);

    // No outer actionCallback: sim:fork supplies its own fork executor.
    await evm.interpret(`load giveth
load sim
sim:fork --using anvil (
  sim:set-balance @me 10e18
  giveth:donate 1e18 ${ZERO_ADDRESS} to evmcrispr
  sim:expect @bool(@token.balance(XDAI ${PROJECT_RECIPIENT}) >= 1e18)
)`);

    expect(recordedLogins).to.have.length(0);
    expect(recordedDonations).to.have.length(0);
  }, 30000);

  it("sends a direct tip as a second transfer linked to the main donation", async () => {
    const executed = await runDonate(
      `giveth:donate 100e18 ${WXDAI} to evmcrispr --tip 5 --anonymous true`,
    );

    expect(executed).to.have.length(2);
    const tipTransfer = decodeFunctionData({
      abi: erc20Abi,
      data: (executed[1] as any).data,
    });
    expect(tipTransfer.args).to.eql([TIP_RECIPIENT, 5n * 10n ** 18n]);

    expect(recordedDonations).to.have.length(2);
    expect(recordedDonations[0]).to.include({
      transactionId: fakeHash(1),
      amount: 100,
      anonymous: true,
      useDonationBox: true,
    });
    expect(recordedDonations[1]).to.include({
      transactionId: fakeHash(2),
      amount: 5,
      projectId: 1,
      useDonationBox: true,
      relevantDonationTxHash: fakeHash(1),
    });
  });
});
