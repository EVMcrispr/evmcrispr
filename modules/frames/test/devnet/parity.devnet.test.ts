// Live, opt-in (EVMCRISPR_FRAME_DEVNET=1): parity of the in-process frame
// simulation with the devnet's own (`ethrex_simulateFrameTransaction` on
// `bun scripts/frame-devnet.ts up quick`). Each frame's outcome must match;
// each body frame's gas within a stated margin. This is what notices when
// the devnet's rules move away from ours (EIP-8141 is a draft).
import { describe, expect, it } from "bun:test";
import {
  eip8141TracerProfile as profile,
  simulate,
  toFrameRequests,
} from "@evmcrispr/viem-frames";
import {
  encodeTx,
  newTx,
  secp256k1Placeholder,
  signTx,
} from "@forshtat/hegota-support/tx";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { devAccounts } from "../../../../scripts/frame-devnet-config";
import { createEthereumJSBackend } from "../../../sim/src/lib/ethereumjs-backend";
import { createRevmBackend } from "../../../sim/src/lib/revm-backend";
import { frameAction } from "../../src/actions";
import { chains } from "../../src/chains";
import type { FrameSpec } from "../../src/frame-action";
import { layoutFrames } from "../../src/layout";

const ENABLED = process.env.EVMCRISPR_FRAME_DEVNET === "1";
const quick = chains.find((c) => c.key === "framesQuick")!;
const DEAD = "0x000000000000000000000000000000000000dEaD";
const FAILS = {
  to: "0x0000000000000000000000000000000000000001" as const,
  data: "0x" as Hex,
  value: 0n,
  gas: 1n,
};
/** Body frames' execution gas may differ by this much (gas schedules of
 *  the two EVMs at the same fork are close, not identical). */
const GAS_MARGIN = 2_000n;

const CASES: {
  name: string;
  actions: Parameters<typeof layoutFrames>[0]["actions"];
}[] = [
  {
    name: "a transfer",
    actions: [{ to: DEAD, value: 1n, data: "0x", gas: 50_000n }],
  },
  {
    name: "a precompile computing on the frame's data",
    actions: [
      {
        to: "0x0000000000000000000000000000000000000004",
        value: 0n,
        data: `0x${"11".repeat(64)}`,
        gas: 50_000n,
      },
    ],
  },
  {
    name: "a failed frame between two transfers",
    actions: [
      { to: DEAD, value: 1n, data: "0x", gas: 50_000n },
      FAILS,
      { to: DEAD, value: 2n, data: "0x", gas: 50_000n },
    ],
  },
];

/** Runs one case on a devnet: ethrex's simulation against ours. */
async function compare(
  devnet: (typeof chains)[number],
  account: number,
  actions: Parameters<typeof layoutFrames>[0]["actions"],
  create: typeof createEthereumJSBackend,
) {
  const { privateKey, address: sender } = devAccounts()[account]!;
  const frames: FrameSpec[] = layoutFrames({
    actions,
    sender,
    chainId: devnet.id,
    stateGas: 200_000n,
  });
  const nonce = BigInt(
    (
      (await (
        await fetch(devnet.rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getTransactionCount",
            params: [sender, "latest"],
          }),
        })
      ).json()) as { result: Hex }
    ).result,
  );
  const unsigned = newTx({
    chainId: devnet.id,
    sender,
    nonceSeq: nonce,
    frames: toFrameRequests(frames, profile) as never,
    signatures: [secp256k1Placeholder(profile)],
    fees: { maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1n },
  });
  const raw = encodeTx(profile, await signTx(profile, unsigned, privateKey));
  const ethrex = (await simulate(devnet.rpcUrl, raw)) as {
    frames: { gasUsed: Hex; succeeded: boolean }[];
  };
  const sim = await create({
    upstreamRpcUrl: devnet.rpcUrl,
    chainId: devnet.id,
  });
  const action = frameAction.create({
    chainId: devnet.id,
    from: sender,
    data: { frames, mempool: "canonical" },
  });
  const ours = (await frameAction.simulate!(
    action,
    sim.simContext!(action, { onLog: () => {} }),
  )) as unknown as { frameReceipts: { status: string; gasUsed: bigint }[] };
  expect(ours.frameReceipts).toHaveLength(ethrex.frames.length);
  ethrex.frames.forEach((theirs, i) => {
    const mine = ours.frameReceipts[i]!;
    expect(mine.status === "success" || mine.status === "impersonated").toBe(
      theirs.succeeded,
    );
    if (mine.status === "impersonated") return;
    const diff = mine.gasUsed - BigInt(theirs.gasUsed);
    expect(diff < 0n ? -diff : diff).toBeLessThanOrEqual(GAS_MARGIN);
  });
}

describe.skipIf(!ENABLED)(
  "frame simulation parity with ethrex, warm state",
  () => {
    const mining = chains.find((c) => c.key === "framesMining")!;
    // A contract that reads slot 0, and one that calls it.
    let reader: `0x${string}`;
    let caller: `0x${string}`;
    it("deploys its contracts", async () => {
      const { privateKey } = devAccounts()[7]!;
      const { createPublicClient, createWalletClient, defineChain, http } =
        await import("viem");
      const chain = defineChain({
        id: mining.id,
        name: mining.name,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [mining.rpcUrl] } },
      });
      const wallet = createWalletClient({
        account: privateKeyToAccount(privateKey),
        chain,
        transport: http(),
      });
      const client = createPublicClient({ chain, transport: http() });
      const deploy = async (runtime: string) => {
        const size = (runtime.length / 2).toString(16).padStart(2, "0");
        const hash = await wallet.sendTransaction({
          data: `0x60${size}600c60003960${size}6000f3${runtime}`,
        });
        return (await client.waitForTransactionReceipt({ hash }))
          .contractAddress!;
      };
      reader = await deploy("60005460005260206000f3");
      caller = await deploy(`600060006000600073${reader.slice(2)}5afa00`);
    }, 120_000);
    for (const [backend, create] of [
      ["ethereumjs", createEthereumJSBackend],
      ["revm", createRevmBackend],
    ] as const) {
      const call = (to: `0x${string}`) => ({
        to,
        value: 0n,
        data: "0x" as Hex,
        gas: 100_000n,
      });
      it(
        `a slot read by one frame is warm for the next (${backend})`,
        () => compare(mining, 8, [call(reader), call(reader)], create),
        120_000,
      );
      it(
        `an address reached inside one frame is a warm target for the next (${backend})`,
        () => compare(mining, 8, [call(caller), call(reader)], create),
        120_000,
      );
    }
  },
);

describe.skipIf(!ENABLED)("frame simulation parity with ethrex", () => {
  for (const { name, actions } of CASES)
    for (const [backend, create] of [
      ["ethereumjs", createEthereumJSBackend],
      ["revm", createRevmBackend],
    ] as const)
      it(`${name} (${backend})`, async () => {
        const { privateKey, address: sender } = devAccounts()[0]!;
        privateKeyToAccount(privateKey);
        const frames: FrameSpec[] = layoutFrames({
          actions,
          sender,
          chainId: quick.id,
          stateGas: 200_000n,
        });

        // The devnet's simulation of the transaction, signed.
        const nonce = BigInt(
          (
            (await (
              await fetch(quick.rpcUrl, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  jsonrpc: "2.0",
                  id: 1,
                  method: "eth_getTransactionCount",
                  params: [sender, "latest"],
                }),
              })
            ).json()) as { result: Hex }
          ).result,
        );
        const unsigned = newTx({
          chainId: quick.id,
          sender,
          nonceSeq: nonce,
          frames: toFrameRequests(frames, profile) as never,
          signatures: [secp256k1Placeholder(profile)],
          fees: { maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1n },
        });
        const raw = encodeTx(
          profile,
          await signTx(profile, unsigned, privateKey),
        );
        const ethrex = (await simulate(quick.rpcUrl, raw)) as {
          frames: { gasUsed: Hex; succeeded: boolean }[];
        };

        // Ours, on a fork of the same chain.
        const sim = await create({
          upstreamRpcUrl: quick.rpcUrl,
          chainId: quick.id,
        });
        const action = frameAction.create({
          chainId: quick.id,
          from: sender,
          data: { frames, mempool: "canonical" },
        });
        const ours = (await frameAction.simulate!(
          action,
          sim.simContext!(action, { onLog: () => {} }),
        )) as unknown as {
          frameReceipts: { status: string; gasUsed: bigint }[];
        };

        console.log(
          JSON.stringify(
            { ethrex: ethrex.frames, ours: ours.frameReceipts },
            (_, v) => (typeof v === "bigint" ? v.toString() : v),
          ),
        );
        expect(ours.frameReceipts).toHaveLength(ethrex.frames.length);
        ethrex.frames.forEach((theirs, i) => {
          const mine = ours.frameReceipts[i]!;
          expect(
            mine.status === "success" || mine.status === "impersonated",
          ).toBe(theirs.succeeded);
          // The sender's verify frame is impersonated in ours: no gas to compare.
          if (mine.status === "impersonated") return;
          const diff = mine.gasUsed - BigInt(theirs.gasUsed);
          expect(diff < 0n ? -diff : diff).toBeLessThanOrEqual(GAS_MARGIN);
        });
      }, 120_000);
});
