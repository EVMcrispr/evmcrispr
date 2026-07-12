import type { Action } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import {
  encodeFunctionData,
  parseAbi,
  toEventSelector,
  zeroAddress,
} from "viem";
import type Bridges from "..";
import {
  LZ_EID_TO_CHAIN,
  LZ_EIDS,
  LZ_ENDPOINT_V2,
  OFT_BOOK,
} from "../addresses";
import { clientFor } from "../utils/clients";
import {
  bytes32ToAddress,
  decodeLzPacket,
  decodePacketSentLog,
} from "./lib/lzPacket";
import { fetchLzMessageStatus } from "./lib/lzScanApi";
import type {
  BridgeAdapter,
  BridgeFeeQuote,
  BridgeRequest,
  BridgeTransferStatus,
} from "./types";

export const PACKET_SENT_TOPIC = toEventSelector(
  "PacketSent(bytes,bytes,address)",
);

const oftAbi = parseAbi([
  "struct SendParam { uint32 dstEid; bytes32 to; uint256 amountLD; uint256 minAmountLD; bytes extraOptions; bytes composeMsg; bytes oftCmd; }",
  "struct MessagingFee { uint256 nativeFee; uint256 lzTokenFee; }",
  "struct OFTLimit { uint256 minAmountLD; uint256 maxAmountLD; }",
  "struct OFTFeeDetail { int256 feeAmountLD; string description; }",
  "struct OFTReceipt { uint256 amountSentLD; uint256 amountReceivedLD; }",
  "struct MessagingReceipt { bytes32 guid; uint64 nonce; MessagingFee fee; }",
  "function oftVersion() view returns (bytes4 interfaceId, uint64 version)",
  "function token() view returns (address)",
  "function approvalRequired() view returns (bool)",
  "function quoteOFT(SendParam sendParam) view returns (OFTLimit, OFTFeeDetail[], OFTReceipt)",
  "function quoteSend(SendParam sendParam, bool payInLzToken) view returns (MessagingFee)",
  "function send(SendParam sendParam, MessagingFee fee, address refundAddress) payable returns (MessagingReceipt, OFTReceipt)",
]);

const endpointAbi = parseAbi([
  "struct Origin { uint32 srcEid; bytes32 sender; uint64 nonce; }",
  "function lzReceive(Origin origin, address receiver, bytes32 guid, bytes message, bytes extraData) payable",
]);

const oappAbi = parseAbi([
  "struct Origin { uint32 srcEid; bytes32 sender; uint64 nonce; }",
  "function lzReceive(Origin origin, bytes32 guid, bytes message, address executor, bytes extraData) payable",
]);

function addressToBytes32(address: Address): Hex {
  return `0x${address.slice(2).padStart(64, "0")}` as Hex;
}

/**
 * Resolve the OFT (or OFT adapter) that carries `token` on `chainId`:
 * the address book first, then the token itself when it implements the
 * OFT interface.
 */
async function resolveOft(
  module: Bridges,
  chainId: number,
  token: Address,
): Promise<{ oft: Address; needsApproval: boolean; underlying: Address }> {
  const booked = OFT_BOOK[chainId]?.[token];
  const candidate = booked ?? token;
  const client = await clientFor(module, chainId);

  try {
    await client.readContract({
      address: candidate,
      abi: oftAbi,
      functionName: "oftVersion",
    });
  } catch {
    throw new ErrorException(
      `${token} is not a LayerZero OFT on chain ${chainId}; pass the OFT/OFT-adapter address as <token> or use another adapter`,
    );
  }

  // An OFT adapter wraps a pre-existing ERC-20 and escrows it; a native OFT
  // IS the token and mints/burns, needing no allowance.
  const underlying = (await client.readContract({
    address: candidate,
    abi: oftAbi,
    functionName: "token",
  })) as Address;

  let needsApproval: boolean;
  try {
    needsApproval = (await client.readContract({
      address: candidate,
      abi: oftAbi,
      functionName: "approvalRequired",
    })) as boolean;
  } catch {
    // Older OFTs omit approvalRequired(): infer it from whether the OFT
    // escrows a separate token.
    needsApproval = underlying.toLowerCase() !== candidate.toLowerCase();
  }

  return { oft: candidate, needsApproval, underlying };
}

function buildSendParam(req: BridgeRequest, minAmountLD: bigint) {
  return {
    dstEid: LZ_EIDS[req.dstChainId],
    to: addressToBytes32(req.recipient),
    amountLD: req.amount,
    minAmountLD,
    extraOptions: "0x" as Hex,
    composeMsg: "0x" as Hex,
    oftCmd: "0x" as Hex,
  };
}

const layerzero: BridgeAdapter = {
  name: "LayerZero",
  kind: "onchain",

  supports(srcChainId, dstChainId, token) {
    if (srcChainId === dstChainId) return false;
    if (!(srcChainId in LZ_EIDS) || !(dstChainId in LZ_EIDS)) return false;
    // Whether a token is an OFT is only knowable at runtime, so LayerZero
    // is never picked implicitly (see DEFAULT_ORDER).
    if (token === zeroAddress) return false;
    return true;
  },

  requiresClaim() {
    return false;
  },

  async quote(module, req): Promise<BridgeFeeQuote> {
    const { oft } = await resolveOft(module, req.srcChainId, req.token);
    const client = await module.getClient();

    const probe = buildSendParam(req, req.amount);
    const [, , receipt] = (await client.readContract({
      address: oft,
      abi: oftAbi,
      functionName: "quoteOFT",
      args: [probe],
    })) as [
      unknown,
      unknown,
      { amountSentLD: bigint; amountReceivedLD: bigint },
    ];

    const sendParam = buildSendParam(req, receipt.amountReceivedLD);
    const fee = (await client.readContract({
      address: oft,
      abi: oftAbi,
      functionName: "quoteSend",
      args: [sendParam, false],
    })) as { nativeFee: bigint; lzTokenFee: bigint };

    return {
      tokenFee: receipt.amountSentLD - receipt.amountReceivedLD,
      nativeFee: fee.nativeFee,
      amountOut: receipt.amountReceivedLD,
      route: { oft, sendParam, nativeFee: fee.nativeFee },
    };
  },

  async buildBridge(module, req) {
    const quote = req.quote ?? (await layerzero.quote(module, req));
    const route = quote.route as {
      oft: Address;
      sendParam: ReturnType<typeof buildSendParam>;
      nativeFee: bigint;
    };
    const { needsApproval, underlying } = await resolveOft(
      module,
      req.srcChainId,
      req.token,
    );

    return {
      approvalTarget: needsApproval ? route.oft : undefined,
      // The adapter pulls the underlying ERC-20, not the OFT wrapper.
      approvalToken: underlying,
      actions: [
        {
          to: route.oft,
          value: route.nativeFee,
          data: encodeFunctionData({
            abi: oftAbi,
            functionName: "send",
            args: [
              route.sendParam,
              { nativeFee: route.nativeFee, lzTokenFee: 0n },
              req.from,
            ],
          }),
        },
      ],
    };
  },

  async status(_module, src): Promise<BridgeTransferStatus> {
    const status = await fetchLzMessageStatus(src.hash);
    if (!status) return "unknown";
    if (status === "DELIVERED") return "done";
    if (["INFLIGHT", "CONFIRMING"].includes(status)) return "pending";
    return "unknown";
  },

  async buildClaim() {
    throw new ErrorException(
      "LayerZero messages are delivered by executors; there is nothing to claim. Track delivery at https://layerzeroscan.com",
    );
  },

  relayHandler: {
    id: "lz-oft",
    sourceEvents() {
      return [{ topic: PACKET_SENT_TOPIC, address: LZ_ENDPOINT_V2 }];
    },

    async parse(log) {
      const { encodedPayload } = decodePacketSentLog(log.data);
      const packet = decodeLzPacket(encodedPayload);
      const dstChainId = LZ_EID_TO_CHAIN[packet.dstEid];
      if (dstChainId === undefined) return null;
      return {
        dstChainId,
        note: `packet ${packet.guid.slice(0, 10)}… to ${bytes32ToAddress(packet.receiver)}`,
      };
    },

    /** Deliver the packet the way the executor would: impersonate the
     *  destination endpoint calling lzReceive on the receiving OApp. The
     *  OApp's peer check passes because `sender` is the real source OFT. */
    async buildDelivery(_module, log): Promise<Action[]> {
      const { encodedPayload } = decodePacketSentLog(log.data);
      const packet = decodeLzPacket(encodedPayload);
      const receiver = bytes32ToAddress(packet.receiver);

      return [
        {
          type: "rpc",
          method: "sim_addNativeBalance",
          params: [LZ_ENDPOINT_V2, `0x${(10n ** 18n).toString(16)}`],
        },
        {
          to: receiver,
          from: LZ_ENDPOINT_V2,
          data: encodeFunctionData({
            abi: oappAbi,
            functionName: "lzReceive",
            args: [
              {
                srcEid: packet.srcEid,
                sender: packet.sender,
                nonce: packet.nonce,
              },
              packet.guid,
              packet.message,
              zeroAddress,
              "0x",
            ],
          }),
        },
      ];
    },
  },
};

export { endpointAbi };
export default layerzero;
