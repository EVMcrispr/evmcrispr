import "../../setup";
import { beforeEach } from "bun:test";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import { GNO, WXDAI, ZERO_ADDRESS } from "../../fixtures";
import {
  BALANCER_POOL_ID,
  BALANCER_RATE,
  balancerState,
} from "../../fixtures/msw-handlers";

const BALANCER_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";

const vaultAbi = parseAbi([
  "struct BatchSwapStep { bytes32 poolId; uint256 assetInIndex; uint256 assetOutIndex; uint256 amount; bytes userData; }",
  "struct FundManagement { address sender; bool fromInternalBalance; address recipient; bool toInternalBalance; }",
  "function batchSwap(uint8 kind, BatchSwapStep[] swaps, address[] assets, FundManagement funds, int256[] limits, uint256 deadline) payable returns (int256[] assetDeltas)",
]);
const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const AMOUNT = 100n * 10n ** 18n;

beforeEach(() => balancerState.reset());

function decodeBatchSwap(action: any) {
  expect(action.to).to.eq(BALANCER_VAULT);
  const { functionName, args } = decodeFunctionData({
    abi: vaultAbi,
    data: action.data,
  });
  expect(functionName).to.eq("batchSwap");
  const [kind, swaps, assets, funds, limits, deadline] =
    args as unknown as any[];
  return { kind, swaps, assets, funds, limits, deadline };
}

describeCommand("swap --using Balancer", {
  describeName: "Swaps > commands > swap --using Balancer",
  module: "swaps",
  preamble: "load swaps",
  cases: [
    {
      name: "encodes a vault batchSwap from the SOR route with auto-approve",
      script: `swaps:swap 100e18 ${WXDAI} to ${GNO} --using Balancer`,
      validate: (actions) => {
        expect(actions).to.have.length(2);
        const approval = decodeFunctionData({
          abi: erc20Abi,
          data: (actions[0] as any).data,
        });
        expect(approval.args).to.eql([BALANCER_VAULT, AMOUNT]);

        const { kind, swaps, assets, funds, limits } = decodeBatchSwap(
          actions[1],
        );
        expect(kind).to.eq(0); // GIVEN_IN
        expect(swaps).to.have.length(1);
        expect(swaps[0].poolId).to.eq(BALANCER_POOL_ID);
        expect(swaps[0].amount).to.eq(AMOUNT);
        expect(assets.map((a: string) => a.toLowerCase())).to.eql([
          WXDAI.toLowerCase(),
          GNO.toLowerCase(),
        ]);
        expect(funds.sender.toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
        expect(funds.recipient.toLowerCase()).to.eq(
          TEST_ACCOUNT_ADDRESS.toLowerCase(),
        );
        expect(funds.fromInternalBalance).to.be.false;

        const minOut = (AMOUNT * BALANCER_RATE * 9950n) / 10000n;
        expect(limits).to.eql([AMOUNT, -minOut]);
      },
    },
  ],
  errorCases: [
    {
      name: "should refuse native-token swaps",
      script: `swaps:swap 1e18 ${ZERO_ADDRESS} to ${GNO} --using Balancer`,
      error: "ERC20 tokens only",
    },
  ],
});

describeCommand("swap-to --using Balancer", {
  describeName: "Swaps > commands > swap-to --using Balancer",
  module: "swaps",
  preamble: "load swaps",
  cases: [
    {
      name: "encodes a GIVEN_OUT batchSwap capped by --max",
      script: `swaps:swap-to 3e18 ${GNO} from ${WXDAI} --using Balancer --max 2e18`,
      validate: (actions) => {
        const { kind, swaps, limits } = decodeBatchSwap(actions.at(-1));
        expect(kind).to.eq(1); // GIVEN_OUT
        expect(swaps[0].amount).to.eq(3n * 10n ** 18n);
        expect(limits).to.eql([2n * 10n ** 18n, -(3n * 10n ** 18n)]);
      },
    },
  ],
});
