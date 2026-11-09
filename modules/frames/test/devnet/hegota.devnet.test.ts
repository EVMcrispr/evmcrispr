// Live, opt-in (EVMCRISPR_HEGOTA=1): parity of the in-process frame
// simulation, on a fork of the public Hegota devnet, with the devnet's own
// (`ethrex_simulateFrameTransaction`). Each frame's outcome and gas must
// match. Nothing is sent: the transactions are signed with anvil's public
// key #0 only so the node accepts them for simulation.
import { describe, expect, it } from "bun:test";
import {
  HEGOTA_DEVNET_RPC,
  hegotaDevnet,
  ethrexHegotaDevnetProfile as profile,
  simulate,
  toFrameRequests,
} from "@evmcrispr/viem-frames";
import {
  encodeTx,
  newTx,
  secp256k1Placeholder,
  signTx,
} from "@forshtat/hegota-support/tx";
import { concat, getContractAddress, type Hex, pad, toHex } from "viem";
import { createEthereumJSBackend } from "../../../sim/src/lib/ethereumjs-backend";
import { createRevmBackend } from "../../../sim/src/lib/revm-backend";
import { frameAction } from "../../src/actions";
import type { FrameSpec } from "../../src/frame-action";

const ENABLED = process.env.EVMCRISPR_HEGOTA === "1";
const KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const SENDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const DEAD = "0x000000000000000000000000000000000000dEaD";
const DEPLOYER = "0x4e59b44847b379578588920ca78fbf26c0b4956c";
/** Body frames' execution gas may differ by this much (two EVMs). */
const GAS_MARGIN = 2_000n;
/** A frame that runs CREATE: compared by outcome only. Hegota prices state
 *  creation as EIP-8037 does (CREATE's base cost moved to the state gas
 *  pool: 21,000 less execution gas, measured 2026-11-09); the fork runs
 *  Prague, which has no state gas. */
const CREATES = (f: FrameSpec) => f.target === DEPLOYER;

const verify: FrameSpec = {
  mode: "verify",
  approve: "both",
  target: null,
  data: "0x",
  value: 0n,
  gas: 30_000n,
};
const frame = (f: Partial<FrameSpec>): FrameSpec => ({
  mode: "sender",
  target: DEAD,
  data: "0x",
  value: 0n,
  gas: 50_000n,
  stateGas: 200_000n,
  ...f,
});
// Runtime 5b600056 (JUMPDEST PUSH1 0 JUMP) loops until its gas runs out.
const LOOP_INIT: Hex = "0x635b6000565f526004601cf3";

function cases(): [string, FrameSpec[]][] {
  const salt = pad(toHex(Date.now()));
  const loop = getContractAddress({
    opcode: "CREATE2",
    from: DEPLOYER,
    salt,
    bytecode: LOOP_INIT,
  });
  return [
    ["a transfer", [verify, frame({ value: 1n })]],
    [
      "a precompile and a transfer, each given 1 gas",
      [
        verify,
        frame({
          target: "0x0000000000000000000000000000000000000001",
          data: `0x${"11".repeat(128)}`,
          gas: 1n,
        }),
        frame({ value: 1n, gas: 1n }),
      ],
    ],
    [
      "a reverting frame between two transfers",
      [
        verify,
        frame({ value: 1n }),
        frame({
          target: DEPLOYER,
          data: concat([pad("0x01"), "0x5f5ffd"]),
          gas: 100_000n,
        }),
        frame({ value: 2n }),
      ],
    ],
    [
      "a deploy through a factory, then the contract run out of gas",
      [
        verify,
        frame({
          mode: "default",
          target: DEPLOYER,
          data: concat([salt, LOOP_INIT]),
          gas: 200_000n,
        }),
        frame({ target: loop }),
      ],
    ],
  ];
}

const rpc = async (method: string, params: unknown[]) =>
  (
    (await (
      await fetch(HEGOTA_DEVNET_RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      })
    ).json()) as { result: Hex }
  ).result;

describe.skipIf(!ENABLED)(
  "frame simulation parity with the Hegota devnet",
  () => {
    for (const [name, frames] of cases())
      for (const [backend, create] of [
        ["ethereumjs", createEthereumJSBackend],
        ["revm", createRevmBackend],
      ] as const)
        it(`${name} (${backend})`, async () => {
          const block = BigInt(await rpc("eth_blockNumber", []));
          const nonce = BigInt(
            await rpc("eth_getTransactionCount", [SENDER, toHex(block)]),
          );
          const unsigned = newTx({
            chainId: hegotaDevnet.id,
            sender: SENDER,
            nonceSeq: nonce,
            frames: toFrameRequests(frames, profile) as never,
            signatures: [secp256k1Placeholder(profile)],
            fees: { maxFeePerGas: 1_000n, maxPriorityFeePerGas: 1n },
          });
          const raw = encodeTx(profile, await signTx(profile, unsigned, KEY));
          const theirs = (await simulate(
            HEGOTA_DEVNET_RPC,
            raw,
            toHex(block),
          )) as { frames: { gasUsed: Hex; succeeded: boolean }[] };

          const sim = await create({
            upstreamRpcUrl: HEGOTA_DEVNET_RPC,
            chainId: hegotaDevnet.id,
            blockNumber: Number(block),
          });
          const action = frameAction.create({
            chainId: hegotaDevnet.id,
            from: SENDER,
            data: { frames, mempool: "canonical" },
          });
          const ours = (await frameAction.simulate!(
            action,
            sim.simContext!(action, { onLog: () => {} }),
          )) as unknown as {
            frameReceipts: { status: string; gasUsed: bigint }[];
          };

          expect(ours.frameReceipts).toHaveLength(theirs.frames.length);
          theirs.frames.forEach((frame, i) => {
            const mine = ours.frameReceipts[i]!;
            expect(
              mine.status === "success" || mine.status === "impersonated",
            ).toBe(frame.succeeded);
            // The sender's verify frame is impersonated in ours.
            if (mine.status === "impersonated" || CREATES(frames[i]!)) return;
            const diff = mine.gasUsed - BigInt(frame.gasUsed);
            expect(diff < 0n ? -diff : diff).toBeLessThanOrEqual(GAS_MARGIN);
          });
        }, 120_000);
  },
);
