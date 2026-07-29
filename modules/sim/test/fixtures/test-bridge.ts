import type { CommandImportMap, Module } from "@evmcrispr/sdk";
import { defineCommand, defineModule, ErrorException } from "@evmcrispr/sdk";
import type { Address } from "viem";
import {
  decodeAbiParameters,
  encodeAbiParameters,
  toEventSelector,
  toHex,
} from "viem";
import type Sim from "../../src";

/**
 * Minimal fake bridge used to exercise the sim relay engine end to end
 * without depending on any real bridge protocol: `send` emits a
 * FakeBridgeSent event from a synthetic emitter contract and registers a
 * relay handler that credits the recipient's native balance on the
 * destination fork.
 */

export const EMITTER = "0x00000000000000000000000000000000000e1117" as const;

export const FAKE_TOPIC = toEventSelector(
  "FakeBridgeSent(uint256,address,uint256)",
);

const TRANSFER_PARAMS = [
  { type: "uint256" }, // destination chain id
  { type: "address" }, // recipient
  { type: "uint256" }, // amount (wei)
] as const;

/**
 * Runtime bytecode that echoes its calldata as the data of a single LOG1
 * with FAKE_TOPIC:
 *   calldatacopy(0, 0, calldatasize()); log1(0, calldatasize(), topic); stop
 *
 * CALLDATASIZE PUSH1 0 PUSH1 0 CALLDATACOPY PUSH32 <topic> CALLDATASIZE
 * PUSH1 0 LOG1 STOP
 */
export const EMITTER_BYTECODE = `0x3660006000377f${FAKE_TOPIC.slice(2)}366000a100`;

function findSim(module: Module): Sim {
  const sim = module.context.modules.find((m) => m.name === "sim") as
    | Sim
    | undefined;
  if (!sim || typeof (sim as any).registerRelayHandler !== "function") {
    throw new ErrorException("testbridge requires the sim module");
  }
  return sim;
}

const send = defineCommand<Module>({
  name: "send",
  description: "Send a fake bridge transfer to another chain.",
  batchable: false,
  args: [
    { name: "dstChainId", type: "number", description: "Destination chain" },
    { name: "to", type: "address", description: "Recipient" },
    { name: "amount", type: "number", description: "Amount in wei" },
  ],
  async run(module, { dstChainId, to, amount }) {
    const sim = findSim(module);
    sim.registerRelayHandler({
      id: "test-bridge",
      sourceEvents: () => [{ topic: FAKE_TOPIC, address: EMITTER }],
      async parse(log) {
        const [dst] = decodeAbiParameters(TRANSFER_PARAMS, log.data);
        return { dstChainId: Number(dst) };
      },
      async buildDelivery(_module, log) {
        const [, recipient, value] = decodeAbiParameters(
          TRANSFER_PARAMS,
          log.data,
        );
        return [
          {
            type: "rpc",
            method: "sim_addNativeBalance",
            params: [recipient, toHex(value)],
          },
        ];
      },
    });

    return [
      {
        to: EMITTER,
        data: encodeAbiParameters(TRANSFER_PARAMS, [
          BigInt(dstChainId as any),
          to as Address,
          BigInt(amount as any),
        ]),
      },
    ];
  },
});

const assertBalance = defineCommand<Module>({
  name: "assert-balance",
  description: "Assert the native balance of an address on the active chain.",
  batchable: false,
  args: [
    { name: "address", type: "address", description: "Account to check" },
    { name: "amount", type: "number", description: "Expected balance (wei)" },
  ],
  async run(module, { address, amount }) {
    const client = await module.getClient();
    const balance = await client.getBalance({ address: address as Address });
    const expected = BigInt(amount as any);
    if (balance !== expected) {
      throw new ErrorException(
        `balance mismatch on chain ${await module.getChainId()}: expected ${expected}, got ${balance}`,
      );
    }
    return [];
  },
});

const commands: CommandImportMap = {
  send: {
    load: async () => ({ default: send }),
    description: send.description ?? "",
  },
  "assert-balance": {
    load: async () => ({ default: assertBalance }),
    description: assertBalance.description ?? "",
  },
};

export default class TestBridge extends defineModule(
  "testbridge",
  commands,
  undefined,
  {},
) {}
