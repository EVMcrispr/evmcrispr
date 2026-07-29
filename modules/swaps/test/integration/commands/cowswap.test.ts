import "../../setup";
import { beforeAll, beforeEach, describe, it } from "bun:test";
import { type Action, isWalletAction } from "@evmcrispr/sdk";
import { expect, getTransports, getWalletClients } from "@evmcrispr/test-utils";
import { describeCommand, evml, Interpreter } from "@evmcrispr/test-utils/evml";
import type { WalletClient } from "viem";
import { decodeFunctionData, parseAbi } from "viem";
import { gnosis } from "viem/chains";
import { GNO, WXDAI, ZERO_ADDRESS } from "../../fixtures";
import {
  COW_MOCK_BUY_AMOUNT,
  COW_MOCK_FEE,
  cowState,
} from "../../fixtures/msw-handlers";

const VAULT_RELAYER = "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110";
const SETTLEMENT = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const AMOUNT = 100n * 10n ** 18n;

describeCommand("swap --using CoWSwap (no wallet)", {
  describeName: "Swaps > commands > swap --using CoWSwap (no wallet)",
  module: "swaps",
  preamble: "load swaps",
  errorCases: [
    {
      name: "should fail when no execution context is available",
      script: `swaps:swap 100e18 ${WXDAI} to ${GNO} --using CoWSwap --min 1`,
      error: "require an execution context with wallet access",
    },
    {
      name: "should refuse to sell the native token",
      script: `swaps:swap 1e18 ${ZERO_ADDRESS} to ${GNO} --using CoWSwap --min 1`,
      error: "cannot sell the native token",
    },
    {
      name: "should be rejected inside a batch",
      script: `batch (
  swaps:swap 100e18 ${WXDAI} to ${GNO} --using CoWSwap --min 1
)`,
      error: "cannot run inside a batch",
    },
  ],
});

describe("Swaps > commands > swap --using CoWSwap > with wallet", () => {
  let walletClient: WalletClient;

  beforeAll(() => {
    walletClient = getWalletClients()[0];
  });

  beforeEach(() => cowState.reset());

  /** Interpreter wired to a wallet that answers eth_signTypedData_v4,
   *  capturing the typed data the venue asked to sign. */
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
          types: { Order: typedData.types.Order },
          primaryType: "Order",
          message: typedData.message,
        });
      }
      return undefined;
    };

    return { account, evm, actionCallback, getTypedData: () => typedData };
  }

  it("signs and posts a sell order, returning only the relayer approval", async () => {
    const { account, evm, actionCallback, getTypedData } = createRunner();

    const actions = await evm.interpret(
      `load swaps
swaps:swap 100e18 ${WXDAI} to ${GNO} --using CoWSwap --min 5e17`,
      actionCallback,
    );

    // Only on-chain action: approve the vault relayer for the full sell
    // amount (quote sellAmount + fee folded back in).
    expect(actions).to.have.length(1);
    const approve = actions[0] as { to: string; data: `0x${string}` };
    expect(approve.to).to.eq(WXDAI);
    const approval = decodeFunctionData({ abi: erc20Abi, data: approve.data });
    expect(approval.args).to.eql([VAULT_RELAYER, AMOUNT]);

    const typedData = getTypedData();
    expect(typedData.domain).to.eql({
      name: "Gnosis Protocol",
      version: "v2",
      chainId: 100,
      verifyingContract: SETTLEMENT,
    });
    expect(typedData.message.kind).to.eq("sell");
    expect(typedData.message.sellAmount).to.eq(AMOUNT.toString());
    expect(typedData.message.buyAmount).to.eq((5n * 10n ** 17n).toString());
    expect(typedData.message.feeAmount).to.eq("0");

    expect(cowState.orders).to.have.length(1);
    const order = cowState.orders[0];
    expect(order.kind).to.eq("sell");
    expect(order.sellAmount).to.eq(AMOUNT.toString());
    expect(order.buyAmount).to.eq((5n * 10n ** 17n).toString());
    expect(order.feeAmount).to.eq("0");
    expect(order.signingScheme).to.eq("eip712");
    expect(order.from.toLowerCase()).to.eq(account.address.toLowerCase());
    expect(order.signature).to.match(/^0x[0-9a-f]{130}$/);
  });

  it("derives the minimum output from the quote when no --min is given", async () => {
    const { evm, actionCallback } = createRunner();

    await evm.interpret(
      `load swaps
swaps:swap 100e18 ${WXDAI} to ${GNO} --using CoWSwap`,
      actionCallback,
    );

    const order = cowState.orders[0];
    expect(order.buyAmount).to.eq(
      ((COW_MOCK_BUY_AMOUNT * 9950n) / 10000n).toString(),
    );
  });

  it("places buy orders for exact-output swaps capped by --max", async () => {
    const { evm, actionCallback } = createRunner();

    const actions = await evm.interpret(
      `load swaps
swaps:swap-to 1e18 ${GNO} from ${WXDAI} --using CoWSwap --max 150e18`,
      actionCallback,
    );

    expect(actions).to.have.length(1);
    const approval = decodeFunctionData({
      abi: erc20Abi,
      data: (actions[0] as any).data,
    });
    expect(approval.args).to.eql([VAULT_RELAYER, 150n * 10n ** 18n]);

    const order = cowState.orders[0];
    expect(order.kind).to.eq("buy");
    expect(order.buyAmount).to.eq((10n ** 18n).toString());
    expect(order.sellAmount).to.eq((150n * 10n ** 18n).toString());
    expect(order.feeAmount).to.eq("0");
    expect(cowState.quoteRequests[0].buyAmountAfterFee).to.eq(
      (10n ** 18n).toString(),
    );
    // The mocked fee is nonzero, proving it was folded out of the order.
    expect(COW_MOCK_FEE > 0n).to.be.true;
  });
});
