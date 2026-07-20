import "../../setup";
import type { Action } from "@evmcrispr/sdk";
import { isTransactionAction } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeFunctionData, parseAbi } from "viem";
import {
  ARB_INBOX_ADDR,
  BASE_L1_BRIDGE,
  DAI_MAINNET,
  OP_L1_BRIDGE,
  USDC_MAINNET,
  WETH_MAINNET,
  ZERO_ADDRESS,
} from "../../fixtures";

const bridgeAbi = parseAbi([
  "function bridgeETHTo(address to, uint32 minGasLimit, bytes extraData) payable",
  "function bridgeERC20To(address localToken, address remoteToken, address to, uint256 amount, uint32 minGasLimit, bytes extraData)",
]);
const inboxAbi = parseAbi(["function depositEth() payable returns (uint256)"]);
const routerAbi = parseAbi([
  "function outboundTransfer(address token, address to, uint256 amount, uint256 maxGas, uint256 gasPriceBid, bytes data) payable returns (bytes)",
]);

const ONE_ETH = 10n ** 18n;
const DAI_OPTIMISM = "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1";

function txs(actions: Action[]) {
  return actions.filter(isTransactionAction) as {
    to: string;
    data: `0x${string}`;
    value?: bigint;
  }[];
}

describeCommand("bridge --using NativeBridge", {
  describeName: "Bridges > commands > bridge > NativeBridge",
  module: "bridges",
  preamble: "load bridges\nswitch mainnet",
  cases: [
    {
      name: "is the default adapter for ETH to an OP Stack L2",
      script: `bridges:bridge ${ONE_ETH} ${ZERO_ADDRESS} to optimism`,
      validate: (actions) => {
        const [deposit] = txs(actions);
        expect(txs(actions)).to.have.length(1); // native token: no approval
        expect(deposit.to).to.eq(OP_L1_BRIDGE);
        expect(deposit.value).to.eq(ONE_ETH);
        const call = decodeFunctionData({
          abi: bridgeAbi,
          data: deposit.data,
        });
        expect(call.functionName).to.eq("bridgeETHTo");
        expect(call.args[1]).to.eq(200000);
      },
    },
    {
      name: "deposits ETH into Base through its own L1 bridge",
      script: `bridges:bridge ${ONE_ETH} ${ZERO_ADDRESS} to base`,
      validate: (actions) => {
        expect(txs(actions)[0].to).to.eq(BASE_L1_BRIDGE);
      },
    },
    {
      name: "deposits a paired ERC-20 with its L2 counterpart",
      script: `bridges:bridge 1000e18 ${DAI_MAINNET} to optimism --using NativeBridge`,
      validate: (actions) => {
        const [approve, deposit] = txs(actions);
        expect(approve.to).to.eq(DAI_MAINNET);
        expect(deposit.to).to.eq(OP_L1_BRIDGE);
        const call = decodeFunctionData({
          abi: bridgeAbi,
          data: deposit.data,
        });
        expect(call.functionName).to.eq("bridgeERC20To");
        expect(call.args[0]).to.eq(DAI_MAINNET);
        expect(call.args[1]).to.eq(DAI_OPTIMISM);
        expect(call.args[3]).to.eq(1000n * 10n ** 18n);
      },
    },
    {
      name: "takes the L2 token from --remote-token when the pair is unknown",
      script: `bridges:bridge 100e6 ${USDC_MAINNET} to optimism --using NativeBridge --remote-token 0x0B2C639c533813F4aA9D7837CAce96CB60775848`,
      validate: (actions) => {
        const call = decodeFunctionData({
          abi: bridgeAbi,
          data: txs(actions)[1].data,
        });
        expect(call.args[1]).to.eq(
          "0x0B2C639c533813F4aA9D7837CAce96CB60775848",
        );
      },
    },
    {
      name: "deposits ETH into Arbitrum through the Inbox",
      script: `bridges:bridge ${ONE_ETH} ${ZERO_ADDRESS} to arbitrum --using NativeBridge`,
      validate: (actions) => {
        const [deposit] = txs(actions);
        expect(deposit.to).to.eq(ARB_INBOX_ADDR);
        expect(deposit.value).to.eq(ONE_ETH);
        expect(
          decodeFunctionData({ abi: inboxAbi, data: deposit.data })
            .functionName,
        ).to.eq("depositEth");
      },
    },
    {
      name: "deposits an ERC-20 into Arbitrum with retryable fees, approving the gateway",
      script: `bridges:bridge 1e18 ${WETH_MAINNET} to arbitrum --using NativeBridge`,
      validate: (actions) => {
        const [approve, deposit] = txs(actions);
        // The gateway (not the router) pulls the tokens.
        expect(approve.to).to.eq(WETH_MAINNET);
        expect(deposit.to).to.eq("0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef");
        // The retryable ticket is funded with msg.value.
        expect(deposit.value).to.be.a("bigint");
        expect(deposit.value! > 0n).to.be.true;
        const call = decodeFunctionData({
          abi: routerAbi,
          data: deposit.data,
        });
        expect(call.args[0]).to.eq(WETH_MAINNET);
        expect(call.args[2]).to.eq(10n ** 18n);
        expect(call.args[3]).to.eq(300_000n); // maxGas
      },
    },
  ],
  errorCases: [
    {
      name: "asks for --remote-token when the ERC-20 pair is unknown",
      script: `bridges:bridge 100e6 ${USDC_MAINNET} to optimism --using NativeBridge`,
      error: "pass --remote-token",
    },
    {
      name: "rejects an Arbitrum ETH deposit to another recipient",
      script: `bridges:bridge ${ONE_ETH} ${ZERO_ADDRESS} to arbitrum --using NativeBridge --receiver 0x59c2de8db2d1516bd9354ca31a58fea25eb37ba9`,
      error: "Arbitrum ETH deposits credit the sender",
    },
    {
      name: "rejects a lane with no canonical bridge",
      script: `bridges:bridge ${ONE_ETH} ${ZERO_ADDRESS} to gnosis --using NativeBridge`,
      error: "NativeBridge doesn't bridge",
    },
  ],
});
