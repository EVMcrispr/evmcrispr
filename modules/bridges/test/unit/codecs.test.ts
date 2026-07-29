import "../setup";
import { describe, expect, it } from "bun:test";
import { encodeAbiParameters, toHex } from "viem";
import { MESSAGE_SENT_TOPIC } from "../../src/adapters/cctp";
import {
  addressToBytes32,
  bytes32ToAddress,
  decodeCctpBurnBody,
  decodeCctpMessage,
  decodeMessageSentLog,
  patchCctpMessage,
} from "../../src/adapters/lib/cctpMessage";
import { decodeLzPacket } from "../../src/adapters/lib/lzPacket";
import { decodeOpaqueData } from "../../src/adapters/lib/opDeposit";
import { arbAliasL1Address } from "../../src/addresses";

const RECIPIENT = "0x59c2de8db2d1516bd9354ca31a58fea25eb37ba9";
const BURN_TOKEN = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const SENDER = "0x28b5a0e9c621a5badaa536219b3a228c8168cf5d";

function u32(value: number): string {
  return value.toString(16).padStart(8, "0");
}
function u256(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

/** Hand-assemble a CCTP v2 MessageV2 carrying a BurnMessageV2 body. */
function buildCctpMessage(opts: {
  srcDomain: number;
  dstDomain: number;
  amount: bigint;
}): `0x${string}` {
  const body =
    u32(1) + // burn message version
    addressToBytes32(BURN_TOKEN as any).slice(2) +
    addressToBytes32(RECIPIENT as any).slice(2) +
    u256(opts.amount) +
    addressToBytes32(SENDER as any).slice(2) +
    u256(0n) + // maxFee
    u256(0n); // feeExecuted

  const header =
    u32(1) + // message version
    u32(opts.srcDomain) +
    u32(opts.dstDomain) +
    "00".repeat(32) + // nonce (assigned off-chain in v2)
    addressToBytes32(SENDER as any).slice(2) +
    addressToBytes32(SENDER as any).slice(2) + // recipient (dest TokenMessenger)
    "00".repeat(32) + // destinationCaller: any
    u32(2000) + // minFinalityThreshold
    u32(0); // finalityThresholdExecuted

  return `0x${header}${body}`;
}

describe("bridges > codecs (unit)", () => {
  describe("CCTP MessageV2", () => {
    const message = buildCctpMessage({
      srcDomain: 0,
      dstDomain: 6,
      amount: 100_000_000n,
    });

    it("round-trips a MessageSent log payload", () => {
      const data = encodeAbiParameters([{ type: "bytes" }], [message]);
      expect(decodeMessageSentLog(data)).toBe(message);
    });

    it("decodes the header fields", () => {
      const decoded = decodeCctpMessage(message);
      expect(decoded.version).toBe(1);
      expect(decoded.sourceDomain).toBe(0);
      expect(decoded.destinationDomain).toBe(6);
      expect(decoded.minFinalityThreshold).toBe(2000);
      expect(decoded.finalityThresholdExecuted).toBe(0);
    });

    it("decodes the burn body", () => {
      const { messageBody } = decodeCctpMessage(message);
      const burn = decodeCctpBurnBody(messageBody);
      expect(burn.amount).toBe(100_000_000n);
      expect(bytes32ToAddress(burn.mintRecipient).toLowerCase()).toBe(
        RECIPIENT,
      );
      expect(bytes32ToAddress(burn.burnToken).toLowerCase()).toBe(BURN_TOKEN);
    });

    it("patches the nonce and executed finality without touching the body", () => {
      const nonce = `0x${"ab".repeat(32)}` as const;
      const patched = patchCctpMessage(message, {
        nonce,
        finalityThresholdExecuted: 2000,
      });
      const decoded = decodeCctpMessage(patched);
      expect(decoded.nonce).toBe(nonce);
      expect(decoded.finalityThresholdExecuted).toBe(2000);
      // Everything else survives.
      expect(decoded.sourceDomain).toBe(0);
      expect(decoded.destinationDomain).toBe(6);
      expect(decoded.minFinalityThreshold).toBe(2000);
      expect(decoded.messageBody).toBe(decodeCctpMessage(message).messageBody);
    });

    it("pins the MessageSent topic", () => {
      expect(MESSAGE_SENT_TOPIC).toBe(
        "0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036",
      );
    });
  });

  describe("LayerZero PacketV1", () => {
    it("decodes a packet header", () => {
      const guid = `${"cd".repeat(32)}`;
      const payload = `0x${"01"}${7n.toString(16).padStart(16, "0")}${u32(
        30101,
      )}${addressToBytes32(SENDER as any).slice(2)}${u32(30184)}${addressToBytes32(
        RECIPIENT as any,
      ).slice(2)}${guid}${"beef"}` as `0x${string}`;

      const packet = decodeLzPacket(payload);
      expect(packet.version).toBe(1);
      expect(packet.nonce).toBe(7n);
      expect(packet.srcEid).toBe(30101);
      expect(packet.dstEid).toBe(30184);
      expect(packet.guid).toBe(`0x${guid}`);
      expect(packet.message).toBe("0xbeef");
    });
  });

  describe("OP Stack opaqueData", () => {
    it("decodes mint, value, gasLimit and calldata", () => {
      const opaque = `0x${u256(5n * 10n ** 17n)}${u256(
        10n ** 17n,
      )}${200000n.toString(16).padStart(16, "0")}00deadbeef` as `0x${string}`;

      const deposit = decodeOpaqueData(opaque);
      expect(deposit.mint).toBe(5n * 10n ** 17n);
      expect(deposit.value).toBe(10n ** 17n);
      expect(deposit.gasLimit).toBe(200000n);
      expect(deposit.isCreation).toBe(false);
      expect(deposit.data).toBe("0xdeadbeef");
    });
  });

  describe("Arbitrum address aliasing", () => {
    it("adds the alias offset", () => {
      expect(
        arbAliasL1Address("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
      ).toBe("0x04b0d6e51aad88f6f4ce6ab8827279cfffb93377");
    });

    it("wraps modulo 2^160", () => {
      const aliased = arbAliasL1Address(
        "0xffffffffffffffffffffffffffffffffffffffff",
      );
      expect(BigInt(aliased)).toBeLessThan(1n << 160n);
      expect(aliased).toBe("0x1111000000000000000000000000000000001110");
    });
  });

  describe("toHex helpers used by relay actions", () => {
    it("encodes amounts the sim virtual methods expect", () => {
      expect(toHex(1000n)).toBe("0x3e8");
    });
  });
});
