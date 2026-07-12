import { getTransports } from "@evmcrispr/test-utils";
import { evml, Interpreter } from "@evmcrispr/test-utils/evml";
import type { Hex } from "viem";
import { custom, encodeAbiParameters, toHex } from "viem";
import { base, mainnet } from "viem/chains";
import { addressToBytes32 } from "../../src/adapters/lib/cctpMessage";
import { CCTP_MESSAGE_TRANSMITTER, USDC_MAINNET } from "../fixtures";

/**
 * A settled CCTP burn (mainnet → Base) served through a stub transport, so
 * the claim and status paths can be exercised against a genuine-shaped
 * source receipt without executing a fork.
 */

export const MESSAGE_SENT_TOPIC =
  "0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036";
export const BURN_HASH = `0x${"11".repeat(32)}` as Hex;
export const ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
export const AMOUNT = 100_000_000n;
/** Base's CCTP domain — where this burn is headed. */
export const DEST_DOMAIN = 6;

function u32(value: number) {
  return value.toString(16).padStart(8, "0");
}
function u256(value: bigint) {
  return value.toString(16).padStart(64, "0");
}

/** A CCTP v2 MessageV2 burning USDC from mainnet to Base. */
function buildMessage(): Hex {
  const body =
    u32(1) +
    addressToBytes32(USDC_MAINNET).slice(2) +
    addressToBytes32(ACCOUNT).slice(2) +
    u256(AMOUNT) +
    addressToBytes32(ACCOUNT).slice(2) +
    u256(0n) +
    u256(0n);
  const header =
    u32(1) +
    u32(0) + // source domain: mainnet
    u32(DEST_DOMAIN) +
    "00".repeat(32) + // nonce: assigned off-chain in v2
    addressToBytes32(ACCOUNT).slice(2) +
    addressToBytes32(ACCOUNT).slice(2) +
    "00".repeat(32) + // destinationCaller: any
    u32(2000) +
    u32(0);
  // viem returns calldata lowercased, so keep the fixture comparable.
  return `0x${header}${body}`.toLowerCase() as Hex;
}

export const MESSAGE = buildMessage();

function claimTransports(usedNonce: bigint) {
  const sourceReceipt = {
    transactionHash: BURN_HASH,
    status: "0x1",
    blockNumber: "0x1",
    logs: [
      {
        address: CCTP_MESSAGE_TRANSMITTER,
        topics: [MESSAGE_SENT_TOPIC],
        data: encodeAbiParameters([{ type: "bytes" }], [MESSAGE]),
        blockNumber: "0x1",
        transactionHash: BURN_HASH,
        logIndex: "0x0",
      },
    ],
  };

  const stub = (chainId: number) =>
    custom({
      async request({ method, params }: { method: string; params?: any[] }) {
        switch (method) {
          case "eth_chainId":
            return toHex(chainId);
          case "eth_getTransactionReceipt":
            return chainId === mainnet.id && params?.[0] === BURN_HASH
              ? sourceReceipt
              : null;
          case "eth_call":
            // MessageTransmitter.usedNonces(bytes32)
            return toHex(usedNonce, { size: 32 });
          default:
            return null;
        }
      },
    });

  return {
    ...getTransports(),
    [mainnet.id]: stub(mainnet.id),
    [base.id]: stub(base.id),
  };
}

/** Interpreter on `chainId` whose mainnet/Base transports serve the burn. */
export function createCctpRunner(chainId: number, usedNonce = 0n) {
  const evm = new Interpreter(evml.registry, {
    account: ACCOUNT,
    transports: claimTransports(usedNonce),
  });
  evm.switchChainId(chainId);
  return evm;
}
