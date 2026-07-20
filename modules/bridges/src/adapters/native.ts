import type { Action } from "@evmcrispr/sdk";
import { ErrorException, encodeAction } from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import {
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  parseAbi,
  toEventSelector,
  toHex,
  zeroAddress,
} from "viem";
import { arbitrum, mainnet } from "viem/chains";
import {
  ARB_INBOX,
  ARB_L1_ERC20_GATEWAY,
  ARB_L1_GATEWAY_ROUTER,
  ARB_L2_ERC20_GATEWAY,
  ARB_L2_GATEWAY_ROUTER,
  arbAliasL1Address,
  OP_L2_STANDARD_BRIDGE,
  OP_ROUTES,
  OP_TOKEN_PAIRS,
} from "../addresses";
import { clientFor } from "../utils/clients";
import {
  buildArbWithdrawalClaim,
  getArbWithdrawalStatus,
} from "./lib/arbWithdrawal";
import { decodeOpaqueData, topicToAddress } from "./lib/opDeposit";
import {
  buildOpWithdrawalClaim,
  getOpWithdrawalStatus,
} from "./lib/opWithdrawal";
import type {
  BridgeAdapter,
  BridgeFeeQuote,
  BridgeRequest,
  BridgeTransferStatus,
} from "./types";

const OP_L2_CHAINS = Object.keys(OP_ROUTES).map(Number);

const l1BridgeAbi = parseAbi([
  "function bridgeETHTo(address to, uint32 minGasLimit, bytes extraData) payable",
  "function bridgeERC20To(address localToken, address remoteToken, address to, uint256 amount, uint32 minGasLimit, bytes extraData)",
]);

const inboxAbi = parseAbi([
  "function depositEth() payable returns (uint256)",
  "function calculateRetryableSubmissionFee(uint256 dataLength, uint256 baseFee) view returns (uint256)",
]);

const gatewayRouterAbi = parseAbi([
  "function outboundTransfer(address token, address to, uint256 amount, uint256 maxGas, uint256 gasPriceBid, bytes data) payable returns (bytes)",
  "function getGateway(address token) view returns (address)",
]);

const l2GatewayAbi = parseAbi([
  "function finalizeInboundTransfer(address token, address from, address to, uint256 amount, bytes data)",
]);

export const TRANSACTION_DEPOSITED_TOPIC = toEventSelector(
  "TransactionDeposited(address,address,uint256,bytes)",
);
export const DEPOSIT_INITIATED_TOPIC = toEventSelector(
  "DepositInitiated(address,address,address,uint256,uint256)",
);
export const INBOX_MESSAGE_DELIVERED_TOPIC = toEventSelector(
  "InboxMessageDelivered(uint256,bytes)",
);

const ARB_RETRYABLE_MAX_GAS = 300_000n;

type Route =
  | { kind: "op-deposit"; l2ChainId: number }
  | { kind: "op-withdrawal"; l2ChainId: number }
  | { kind: "arb-deposit" }
  | { kind: "arb-withdrawal" };

function routeFor(srcChainId: number, dstChainId: number): Route | undefined {
  if (srcChainId === mainnet.id && OP_L2_CHAINS.includes(dstChainId)) {
    return { kind: "op-deposit", l2ChainId: dstChainId };
  }
  if (OP_L2_CHAINS.includes(srcChainId) && dstChainId === mainnet.id) {
    return { kind: "op-withdrawal", l2ChainId: srcChainId };
  }
  if (srcChainId === mainnet.id && dstChainId === arbitrum.id) {
    return { kind: "arb-deposit" };
  }
  if (srcChainId === arbitrum.id && dstChainId === mainnet.id) {
    return { kind: "arb-withdrawal" };
  }
  return undefined;
}

async function arbRetryableFees(module: any): Promise<{
  nativeFee: bigint;
  maxSubmissionCost: bigint;
  gasPriceBid: bigint;
}> {
  const l1 = await module.getClient();
  const block = await l1.getBlock();
  const baseFee = block.baseFeePerGas ?? 1_000_000_000n;
  const maxSubmissionCost = (await l1.readContract({
    address: ARB_INBOX,
    abi: inboxAbi,
    functionName: "calculateRetryableSubmissionFee",
    args: [300n, baseFee],
  })) as bigint;

  const l2 = await clientFor(module, arbitrum.id);
  const gasPriceBid = await l2.getGasPrice();
  return {
    maxSubmissionCost,
    gasPriceBid,
    nativeFee: maxSubmissionCost + ARB_RETRYABLE_MAX_GAS * gasPriceBid,
  };
}

function remoteToken(
  req: BridgeRequest,
  l2ChainId: number,
  opts: Record<string, unknown>,
): Address {
  const override = opts["remote-token"] as Address | undefined;
  if (override) return override;
  const paired = OP_TOKEN_PAIRS[l2ChainId]?.[req.token];
  if (!paired) {
    throw new ErrorException(
      `unknown L2 counterpart of ${req.token} on chain ${l2ChainId}; pass --remote-token <address>`,
    );
  }
  return paired;
}

const native: BridgeAdapter = {
  name: "NativeBridge",
  kind: "onchain",

  supports(srcChainId, dstChainId, token) {
    const route = routeFor(srcChainId, dstChainId);
    if (!route) return false;
    // CCIP/LZ handle arbitrary tokens; the canonical bridges only carry the
    // native asset and tokens with a registered counterpart, but the ERC-20
    // path accepts --remote-token, so any token is potentially bridgeable.
    void token;
    return true;
  },

  requiresClaim(srcChainId, dstChainId) {
    const route = routeFor(srcChainId, dstChainId);
    return route?.kind === "op-withdrawal" || route?.kind === "arb-withdrawal";
  },

  async quote(module, req): Promise<BridgeFeeQuote> {
    const route = routeFor(req.srcChainId, req.dstChainId);
    if (!route) {
      throw new ErrorException(
        `NativeBridge doesn't serve the chain ${req.srcChainId} → ${req.dstChainId} lane`,
      );
    }

    if (route.kind === "arb-deposit" && req.token !== zeroAddress) {
      const { nativeFee } = await arbRetryableFees(module);
      return { tokenFee: 0n, nativeFee, amountOut: req.amount };
    }

    if (route.kind === "op-withdrawal" || route.kind === "arb-withdrawal") {
      module.context.log(
        ":warning: canonical withdrawals take ~7 days; finalize them with bridges:claim <tx-hash> after switching to mainnet",
      );
    }

    return { tokenFee: 0n, nativeFee: 0n, amountOut: req.amount };
  },

  async buildBridge(module, req, { opts }) {
    const route = routeFor(req.srcChainId, req.dstChainId);
    if (!route) {
      throw new ErrorException(
        `NativeBridge doesn't serve the chain ${req.srcChainId} → ${req.dstChainId} lane`,
      );
    }
    const isNative = req.token === zeroAddress;

    switch (route.kind) {
      case "op-deposit": {
        const { l1Bridge } = OP_ROUTES[route.l2ChainId];
        if (isNative) {
          return {
            actions: [
              encodeAction(
                l1Bridge,
                "bridgeETHTo(address,uint32,bytes)",
                [req.recipient, "200000", "0x"],
                { value: req.amount },
              ),
            ],
          };
        }
        return {
          approvalTarget: l1Bridge,
          actions: [
            {
              to: l1Bridge,
              data: encodeFunctionData({
                abi: l1BridgeAbi,
                functionName: "bridgeERC20To",
                args: [
                  req.token,
                  remoteToken(req, route.l2ChainId, opts),
                  req.recipient,
                  req.amount,
                  200000,
                  "0x",
                ],
              }),
            },
          ],
        };
      }

      case "op-withdrawal": {
        if (isNative) {
          return {
            actions: [
              encodeAction(
                OP_L2_STANDARD_BRIDGE,
                "bridgeETHTo(address,uint32,bytes)",
                [req.recipient, "200000", "0x"],
                { value: req.amount },
              ),
            ],
          };
        }
        return {
          approvalTarget: OP_L2_STANDARD_BRIDGE,
          actions: [
            {
              to: OP_L2_STANDARD_BRIDGE,
              data: encodeFunctionData({
                abi: l1BridgeAbi,
                functionName: "bridgeERC20To",
                args: [
                  req.token,
                  remoteToken(req, route.l2ChainId, opts),
                  req.recipient,
                  req.amount,
                  200000,
                  "0x",
                ],
              }),
            },
          ],
        };
      }

      case "arb-deposit": {
        if (isNative) {
          if (req.recipient.toLowerCase() !== req.from.toLowerCase()) {
            throw new ErrorException(
              "Arbitrum ETH deposits credit the sender's own address; drop --receiver, or bridge WETH with --using Across",
            );
          }
          return {
            actions: [
              encodeAction(ARB_INBOX, "depositEth()", [], {
                value: req.amount,
              }),
            ],
          };
        }
        const { nativeFee, maxSubmissionCost, gasPriceBid } =
          await arbRetryableFees(module);
        const l1 = await module.getClient();
        const gateway = (await l1.readContract({
          address: ARB_L1_GATEWAY_ROUTER,
          abi: gatewayRouterAbi,
          functionName: "getGateway",
          args: [req.token],
        })) as Address;

        return {
          // The gateway (not the router) pulls the tokens.
          approvalTarget: gateway,
          actions: [
            {
              to: ARB_L1_GATEWAY_ROUTER,
              value: nativeFee,
              data: encodeFunctionData({
                abi: gatewayRouterAbi,
                functionName: "outboundTransfer",
                args: [
                  req.token,
                  req.recipient,
                  req.amount,
                  ARB_RETRYABLE_MAX_GAS,
                  gasPriceBid,
                  encodeAbiParameters(
                    [{ type: "uint256" }, { type: "bytes" }],
                    [maxSubmissionCost, "0x"],
                  ),
                ],
              }),
            },
          ],
        };
      }

      case "arb-withdrawal": {
        if (isNative) {
          // ArbSys.withdrawEth
          return {
            actions: [
              encodeAction(
                "0x0000000000000000000000000000000000000064",
                "withdrawEth(address)",
                [req.recipient],
                { value: req.amount },
              ),
            ],
          };
        }
        return {
          actions: [
            {
              to: ARB_L2_GATEWAY_ROUTER,
              data: encodeFunctionData({
                abi: gatewayRouterAbi,
                functionName: "outboundTransfer",
                args: [req.token, req.recipient, req.amount, 0n, 0n, "0x"],
              }),
            },
          ],
        };
      }
    }
  },

  async status(module, src): Promise<BridgeTransferStatus> {
    if (OP_L2_CHAINS.includes(src.chainId)) {
      return getOpWithdrawalStatus(module, src.chainId, src.hash);
    }
    if (src.chainId === arbitrum.id) {
      return getArbWithdrawalStatus(module, src.logs);
    }
    // Deposits are delivered by the sequencer within minutes and expose no
    // canonical source-side status.
    return "unknown";
  },

  async buildClaim(module, src, dstChainId) {
    if (dstChainId !== mainnet.id) {
      throw new ErrorException(
        "only canonical withdrawals to mainnet need a claim; deposits are delivered automatically",
      );
    }
    if (OP_L2_CHAINS.includes(src.chainId)) {
      return buildOpWithdrawalClaim(module, src.chainId, src.hash);
    }
    if (src.chainId === arbitrum.id) {
      return buildArbWithdrawalClaim(module, src.chainId, src.logs);
    }
    throw new ErrorException(
      `no canonical withdrawal found in transaction ${src.hash}`,
    );
  },

  relayHandler: {
    id: "native",

    sourceEvents(srcChainId) {
      if (srcChainId === mainnet.id) {
        return [
          // OP Stack deposits (one portal per L2).
          ...Object.values(OP_ROUTES).map((route) => ({
            topic: TRANSACTION_DEPOSITED_TOPIC,
            address: route.portal,
          })),
          // Arbitrum ERC-20 deposits.
          {
            topic: DEPOSIT_INITIATED_TOPIC,
            address: ARB_L1_ERC20_GATEWAY,
          },
          // Arbitrum ETH deposits.
          { topic: INBOX_MESSAGE_DELIVERED_TOPIC, address: ARB_INBOX },
        ];
      }
      return [];
    },

    async parse(log) {
      const topic = log.topics[0]?.toLowerCase();
      if (topic === TRANSACTION_DEPOSITED_TOPIC.toLowerCase()) {
        const l2ChainId = OP_L2_CHAINS.find(
          (id) =>
            OP_ROUTES[id].portal.toLowerCase() === log.address.toLowerCase(),
        );
        if (l2ChainId === undefined) return null;
        return { dstChainId: l2ChainId, note: "OP Stack deposit" };
      }
      if (
        topic === DEPOSIT_INITIATED_TOPIC.toLowerCase() ||
        topic === INBOX_MESSAGE_DELIVERED_TOPIC.toLowerCase()
      ) {
        return { dstChainId: arbitrum.id, note: "Arbitrum deposit" };
      }
      return null;
    },

    /** Replay the derived destination transaction the sequencer would run. */
    async buildDelivery(module, log, ctx): Promise<Action[]> {
      const topic = log.topics[0]?.toLowerCase();

      if (topic === TRANSACTION_DEPOSITED_TOPIC.toLowerCase()) {
        // TransactionDeposited(address indexed from, address indexed to,
        //                      uint256 indexed version, bytes opaqueData)
        const from = topicToAddress(log.topics[1]);
        const to = topicToAddress(log.topics[2]);
        const [opaqueData] = decodeAbiParametersBytes(log.data);
        const deposit = decodeOpaqueData(opaqueData);

        const actions: Action[] = [];
        if (deposit.mint > 0n) {
          actions.push({
            type: "rpc",
            method: "sim_addNativeBalance",
            params: [from, toHex(deposit.mint)],
          });
        }
        actions.push({
          from,
          to,
          value: deposit.value,
          data: deposit.data,
          gas: deposit.gasLimit,
        });
        return actions;
      }

      if (topic === DEPOSIT_INITIATED_TOPIC.toLowerCase()) {
        // DepositInitiated(address l1Token, address indexed from,
        //                  address indexed to, uint256 indexed seq, uint256 amount)
        const from = topicToAddress(log.topics[1]);
        const to = topicToAddress(log.topics[2]);
        const [l1Token, amount] = decodeDepositInitiated(log.data);
        const aliased = arbAliasL1Address(ARB_L1_ERC20_GATEWAY);
        return [
          {
            type: "rpc",
            method: "sim_addNativeBalance",
            params: [aliased, toHex(10n ** 18n)],
          },
          {
            from: aliased,
            to: ARB_L2_ERC20_GATEWAY,
            data: encodeFunctionData({
              abi: l2GatewayAbi,
              functionName: "finalizeInboundTransfer",
              args: [
                l1Token,
                from,
                to,
                amount,
                encodeAbiParameters(
                  [{ type: "bytes" }, { type: "bytes" }],
                  ["0x", "0x"],
                ),
              ],
            }),
          },
        ];
      }

      void ctx;
      // Arbitrum ETH deposit: the retryable credits the sender on L2.
      module.context.log(
        "Arbitrum ETH deposits are credited to the sender on the destination fork",
      );
      return [];
    },
  },
};

/** abi.decode(data, (bytes)) for single-bytes event payloads. */
function decodeAbiParametersBytes(data: Hex): [Hex] {
  return decodeAbiParameters([{ type: "bytes" }], data) as [Hex];
}

function decodeDepositInitiated(data: Hex): [Address, bigint] {
  return decodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    data,
  ) as [Address, bigint];
}

export default native;
