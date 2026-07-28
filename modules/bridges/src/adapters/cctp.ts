import type { Action } from "@evmcrispr/sdk";
import { ErrorException, encodeAction } from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import {
  encodeFunctionData,
  keccak256,
  parseAbi,
  toEventSelector,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  CCTP_DOMAIN_TO_CHAIN,
  CCTP_DOMAINS,
  CCTP_FINALITY_FINALIZED,
  CCTP_MESSAGE_TRANSMITTER_V2,
  CCTP_TOKEN_MESSENGER_V2,
  USDC,
} from "../addresses";
import type { SourceTx } from "../utils/receipts";
import {
  addressToBytes32,
  bytes32ToAddress,
  decodeCctpBurnBody,
  decodeCctpMessage,
  decodeMessageSentLog,
  patchCctpMessage,
} from "./lib/cctpMessage";
import { fetchIrisMessages } from "./lib/irisApi";
import type {
  BridgeAdapter,
  BridgeFeeQuote,
  BridgeTransferStatus,
} from "./types";

export const MESSAGE_SENT_TOPIC = toEventSelector("MessageSent(bytes)");

const transmitterAbi = parseAbi([
  "function attesterManager() view returns (address)",
  "function signatureThreshold() view returns (uint256)",
  "function enableAttester(address attester)",
  "function setSignatureThreshold(uint256 newSignatureThreshold)",
  "function receiveMessage(bytes message, bytes attestation) returns (bool)",
  "function usedNonces(bytes32 nonce) view returns (uint256)",
]);

/**
 * Local attester used to mock Circle attestations inside simulations
 * (anvil's second well-known dev key — never holds real funds).
 */
const MOCK_ATTESTER_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
export const MOCK_ATTESTER_ADDRESS: Address =
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

const GAS_STIPEND = toHex(10n ** 18n);

/** Uniquifies mock-attested nonces within a simulation run. */
let mockNonceCounter = 0;

function assertUsdcLane(
  srcChainId: number,
  dstChainId: number,
  token: Address,
): void {
  if (!supportsLane(srcChainId, dstChainId)) {
    throw new ErrorException(
      `CCTPv2 doesn't serve the chain ${srcChainId} → ${dstChainId} lane`,
    );
  }
  if (token.toLowerCase() !== USDC[srcChainId].toLowerCase()) {
    throw new ErrorException(
      `CCTPv2 only bridges native USDC (${USDC[srcChainId]} on chain ${srcChainId}), got ${token}`,
    );
  }
}

function supportsLane(srcChainId: number, dstChainId: number): boolean {
  return (
    srcChainId !== dstChainId &&
    srcChainId in CCTP_DOMAINS &&
    dstChainId in CCTP_DOMAINS
  );
}

function findMessageSent(src: SourceTx): Hex | undefined {
  const log = src.logs.find(
    (l) =>
      l.topics?.[0]?.toLowerCase() === MESSAGE_SENT_TOPIC.toLowerCase() &&
      l.address.toLowerCase() === CCTP_MESSAGE_TRANSMITTER_V2.toLowerCase(),
  );
  return log ? decodeMessageSentLog(log.data as Hex) : undefined;
}

const cctp: BridgeAdapter = {
  name: "CCTPv2",
  kind: "onchain",

  supports(srcChainId, dstChainId, token) {
    if (!supportsLane(srcChainId, dstChainId)) return false;
    if (token === undefined) return true;
    return token.toLowerCase() === USDC[srcChainId]?.toLowerCase();
  },

  requiresClaim() {
    return true;
  },

  async quote(_module, req): Promise<BridgeFeeQuote> {
    assertUsdcLane(req.srcChainId, req.dstChainId, req.token);
    // Standard (fully-finalized) transfers burn and mint 1:1 with no fee.
    return { tokenFee: 0n, nativeFee: 0n, amountOut: req.amount };
  },

  async buildBridge(_module, req) {
    assertUsdcLane(req.srcChainId, req.dstChainId, req.token);
    return {
      approvalTarget: CCTP_TOKEN_MESSENGER_V2,
      actions: [
        encodeAction(
          CCTP_TOKEN_MESSENGER_V2,
          "depositForBurn(uint256,uint32,bytes32,address,bytes32,uint256,uint32)",
          [
            req.amount.toString(),
            String(CCTP_DOMAINS[req.dstChainId]),
            addressToBytes32(req.recipient),
            req.token,
            addressToBytes32(
              "0x0000000000000000000000000000000000000000", // any caller may deliver
            ),
            "0", // maxFee: standard transfers are free
            String(CCTP_FINALITY_FINALIZED),
          ],
        ),
      ],
    };
  },

  async status(module, src): Promise<BridgeTransferStatus> {
    const message = findMessageSent(src);
    if (!message) return "unknown";
    const decoded = decodeCctpMessage(message);

    const irisMessages = await fetchIrisMessages(
      decoded.sourceDomain,
      src.hash,
    );
    const iris = irisMessages[0];
    if (iris?.status !== "complete") return "pending";

    const dstChainId = CCTP_DOMAIN_TO_CHAIN[decoded.destinationDomain];
    if (dstChainId === undefined) return "unknown";
    const { clientFor } = await import("@evmcrispr/sdk");
    const dstClient = await clientFor(module, dstChainId);
    const used = await dstClient.readContract({
      address: CCTP_MESSAGE_TRANSMITTER_V2,
      abi: transmitterAbi,
      functionName: "usedNonces",
      args: [decoded.nonce],
    });
    return used === 0n ? "claimable" : "done";
  },

  async buildClaim(_module, src, dstChainId) {
    const message = findMessageSent(src);
    if (!message) {
      throw new ErrorException(
        `transaction ${src.hash} contains no CCTP MessageSent event`,
      );
    }
    const decoded = decodeCctpMessage(message);
    const expectedDst = CCTP_DOMAIN_TO_CHAIN[decoded.destinationDomain];
    if (expectedDst !== dstChainId) {
      throw new ErrorException(
        `this CCTP transfer targets chain ${expectedDst}; switch to it before claiming`,
      );
    }

    const irisMessages = await fetchIrisMessages(
      decoded.sourceDomain,
      src.hash,
    );
    const iris =
      irisMessages.find((m) => m.message === message) ?? irisMessages[0];
    if (
      iris?.status !== "complete" ||
      !iris.attestation ||
      iris.attestation === "PENDING"
    ) {
      throw new ErrorException(
        `Circle hasn't attested this transfer yet (status: ${iris?.status ?? "not found"}); poll @bridges:status and retry`,
      );
    }

    return [
      encodeAction(CCTP_MESSAGE_TRANSMITTER_V2, "receiveMessage(bytes,bytes)", [
        iris.message,
        iris.attestation,
      ]),
    ];
  },

  relayHandler: {
    id: "cctp-v2",
    sourceEvents() {
      return [
        { topic: MESSAGE_SENT_TOPIC, address: CCTP_MESSAGE_TRANSMITTER_V2 },
      ];
    },

    async parse(log) {
      const decoded = decodeCctpMessage(decodeMessageSentLog(log.data));
      const dstChainId = CCTP_DOMAIN_TO_CHAIN[decoded.destinationDomain];
      if (dstChainId === undefined) return null;
      const burn = decodeCctpBurnBody(decoded.messageBody);
      return {
        dstChainId,
        note: `${burn.amount} USDC to ${bytes32ToAddress(burn.mintRecipient)}`,
      };
    },

    /**
     * Mock Circle's attestation on the destination fork: enable a local
     * attester (impersonating the attester manager), fill the fields the
     * off-chain attester would (nonce, executed finality), sign the message
     * locally, and drive the REAL receiveMessage verify → mint path.
     */
    async buildDelivery(module, log): Promise<Action[]> {
      const sourceMessage = decodeMessageSentLog(log.data);
      const source = decodeCctpMessage(sourceMessage);
      const message = patchCctpMessage(sourceMessage, {
        // v2 nonces are assigned off-chain; derive a unique one per delivery.
        nonce: keccak256(
          `0x${sourceMessage.slice(2)}${(mockNonceCounter++).toString(16).padStart(8, "0")}`,
        ),
        finalityThresholdExecuted: Math.max(
          source.minFinalityThreshold,
          CCTP_FINALITY_FINALIZED,
        ),
      });
      const client = await module.getClient();

      const attesterManager = (await client.readContract({
        address: CCTP_MESSAGE_TRANSMITTER_V2,
        abi: transmitterAbi,
        functionName: "attesterManager",
      })) as Address;
      const threshold = (await client.readContract({
        address: CCTP_MESSAGE_TRANSMITTER_V2,
        abi: transmitterAbi,
        functionName: "signatureThreshold",
      })) as bigint;

      const attester = privateKeyToAccount(MOCK_ATTESTER_KEY);
      const attestation = await attester.sign({ hash: keccak256(message) });

      const actions: Action[] = [
        // Gas for the impersonated senders.
        {
          type: "rpc",
          method: "sim_addNativeBalance",
          params: [attesterManager, GAS_STIPEND],
        },
        {
          type: "rpc",
          method: "sim_addNativeBalance",
          params: [MOCK_ATTESTER_ADDRESS, GAS_STIPEND],
        },
        {
          to: CCTP_MESSAGE_TRANSMITTER_V2,
          from: attesterManager,
          data: encodeFunctionData({
            abi: transmitterAbi,
            functionName: "enableAttester",
            args: [MOCK_ATTESTER_ADDRESS],
          }),
        },
      ];
      if (threshold !== 1n) {
        actions.push({
          to: CCTP_MESSAGE_TRANSMITTER_V2,
          from: attesterManager,
          data: encodeFunctionData({
            abi: transmitterAbi,
            functionName: "setSignatureThreshold",
            args: [1n],
          }),
        });
      }
      actions.push({
        to: CCTP_MESSAGE_TRANSMITTER_V2,
        from: MOCK_ATTESTER_ADDRESS,
        data: encodeFunctionData({
          abi: transmitterAbi,
          functionName: "receiveMessage",
          args: [message, attestation],
        }),
      });
      return actions;
    },
  },
};

export default cctp;
