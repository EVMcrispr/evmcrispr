import "../../setup";
import type { Action } from "@evmcrispr/sdk";
import { isTransactionAction } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { decodeAbiParameters, decodeFunctionData, parseAbi } from "viem";
import { DAI_MAINNET, LINK_MAINNET } from "../../fixtures";

/** USDT0's OFT adapter on mainnet — the LayerZero path for USDT. */
const USDT_OFT_ADAPTER = "0x6C96dE32CEa08842dcc4058c14d3aaAD7Fa41dee";
const USDT_MAINNET = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);
const CCIP_ROUTER_MAINNET = "0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D";
const ARBITRUM_SELECTOR = 4949039107694359620n;
const ARBITRUM_EID = 30110;

const oftAbi = parseAbi([
  "struct SendParam { uint32 dstEid; bytes32 to; uint256 amountLD; uint256 minAmountLD; bytes extraOptions; bytes composeMsg; bytes oftCmd; }",
  "struct MessagingFee { uint256 nativeFee; uint256 lzTokenFee; }",
  "struct MessagingReceipt { bytes32 guid; uint64 nonce; MessagingFee fee; }",
  "struct OFTReceipt { uint256 amountSentLD; uint256 amountReceivedLD; }",
  "function send(SendParam sendParam, MessagingFee fee, address refundAddress) payable returns (MessagingReceipt, OFTReceipt)",
]);

const ccipAbi = parseAbi([
  "struct EVMTokenAmount { address token; uint256 amount; }",
  "struct EVM2AnyMessage { bytes receiver; bytes data; EVMTokenAmount[] tokenAmounts; address feeToken; bytes extraArgs; }",
  "function ccipSend(uint64 destinationChainSelector, EVM2AnyMessage message) payable returns (bytes32)",
]);

function txs(actions: Action[]) {
  return actions.filter(isTransactionAction) as {
    to: string;
    data: `0x${string}`;
    value?: bigint;
  }[];
}

describeCommand("bridge --using LayerZero", {
  describeName: "Bridges > commands > bridge > LayerZero",
  module: "bridges",
  preamble: "load bridges\nswitch mainnet",
  cases: [
    {
      name: "quotes the OFT and sends it with the messaging fee attached",
      script: `bridges:bridge 1000000 ${USDT_OFT_ADAPTER} arbitrum --using LayerZero`,
      validate: (actions) => {
        const [approve, send] = txs(actions);
        // The adapter escrows real USDT, so the allowance is on USDT itself
        // (not on the OFT wrapper), granted to the adapter.
        expect(approve.to).to.eq(USDT_MAINNET);
        const approval = decodeFunctionData({
          abi: erc20Abi,
          data: approve.data,
        });
        expect(approval.args).to.eql([USDT_OFT_ADAPTER, 1_000_000n]);
        expect(send.to).to.eq(USDT_OFT_ADAPTER);
        // The LayerZero messaging fee rides on the value.
        expect(send.value! > 0n).to.be.true;

        const call = decodeFunctionData({ abi: oftAbi, data: send.data });
        const [sendParam, fee] = call.args;
        expect(sendParam.dstEid).to.eq(ARBITRUM_EID);
        expect(sendParam.amountLD).to.eq(1_000_000n);
        // minAmountLD comes from quoteOFT, so the send can't be front-run
        // into a worse rate.
        expect(sendParam.minAmountLD).to.eq(1_000_000n);
        expect(sendParam.to).to.match(/^0x0{24}[0-9a-f]{40}$/i);
        expect(fee.nativeFee).to.eq(send.value!);
        expect(fee.lzTokenFee).to.eq(0n);
      },
    },
  ],
  errorCases: [
    {
      name: "rejects a token that is not an OFT",
      script: `bridges:bridge 1e18 ${DAI_MAINNET} arbitrum --using LayerZero`,
      error: "is not a LayerZero OFT",
    },
  ],
});

describeCommand("bridge --using CCIP", {
  describeName: "Bridges > commands > bridge > CCIP",
  module: "bridges",
  preamble: "load bridges\nswitch mainnet",
  cases: [
    {
      name: "approves the router and sends the token through it with the CCIP fee",
      script: `bridges:bridge 1e18 ${LINK_MAINNET} arbitrum --using CCIP`,
      validate: (actions) => {
        const [approve, send] = txs(actions);
        expect(approve.to).to.eq(LINK_MAINNET);
        expect(send.to).to.eq(CCIP_ROUTER_MAINNET);
        // The messaging fee is paid in the native token.
        expect(send.value! > 0n).to.be.true;

        const call = decodeFunctionData({ abi: ccipAbi, data: send.data });
        const [selector, message] = call.args;
        expect(selector).to.eq(ARBITRUM_SELECTOR);
        expect(message.tokenAmounts).to.eql([
          { token: LINK_MAINNET, amount: 10n ** 18n },
        ]);
        // The receiver is abi.encode(address) and the fee token is native.
        const [receiver] = decodeAbiParameters(
          [{ type: "address" }],
          message.receiver,
        );
        expect(receiver).to.match(/^0x[0-9a-fA-F]{40}$/);
        expect(message.feeToken).to.eq(
          "0x0000000000000000000000000000000000000000",
        );
        // EVMExtraArgsV1 tag with a zero gas limit (EOA transfer).
        expect(message.extraArgs.startsWith("0x97a657c9")).to.be.true;
      },
    },
  ],
  errorCases: [
    {
      name: "reports when a token has no CCIP pool on the lane",
      // USDC has a Gnosis pool; DAI does not, so getFee reverts.
      script: `bridges:bridge 1e18 ${DAI_MAINNET} gnosis --using CCIP`,
      error: "CCIP can't route",
    },
  ],
});
