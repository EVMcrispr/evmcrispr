// Live, opt-in (EVMCRISPR_FRAME_DEVNET=1): the test wallet on the local
// mining devnet (`bun scripts/frame-devnet.ts up mining`), every request
// approved as a user would: an ordinary transfer, and a plain sender's frame
// transaction sent by viem-frames through the wallet's eth_signTransaction.
import { describe, expect, it } from "bun:test";
import {
  eip8141TracerProfile,
  type FrameTransactionReceipt,
  sendFrameTransactionFromWallet,
  withFrames,
} from "@evmcrispr/viem-frames";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  http,
} from "viem";
import { createTestWallet, type SigningRequest } from "../../src";

const ENABLED = process.env.EVMCRISPR_FRAME_DEVNET === "1";
const RPC = "http://127.0.0.1:32003";
const DEAD = "0x000000000000000000000000000000000000dEaD";
const mining = {
  id: 81412,
  name: "Frames mining devnet",
  rpcUrl: RPC,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
};

describe.skipIf(!ENABLED)("the test wallet on the mining devnet", () => {
  const shown: SigningRequest[] = [];
  const w = createTestWallet({
    chains: [mining],
    approve: async (r) => {
      shown.push(r);
      return true;
    },
  });
  // Anvil #5: kept apart from the accounts other devnet tests send from.
  w.selectAccount(5);
  const sender = w.account().address;
  const wallet = createWalletClient({
    account: sender,
    transport: custom(w.provider),
  });
  const node = createPublicClient({ transport: http(RPC) });

  it("sends an ordinary transfer it showed", async () => {
    const hash = await wallet.sendTransaction({
      to: DEAD,
      value: 1n,
      chain: null,
    });
    const receipt = await node.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");
    expect(shown.at(-1)).toMatchObject({ kind: "transaction", to: DEAD });
  }, 120_000);

  it("signs a plain sender's frame transaction, which is mined", async () => {
    const chain = withFrames(
      defineChain({
        id: mining.id,
        name: mining.name,
        nativeCurrency: mining.nativeCurrency,
        rpcUrls: { default: { http: [RPC] } },
      }),
      { profile: eip8141TracerProfile },
    );
    const { receipt } = await sendFrameTransactionFromWallet({
      wallet,
      sender,
      frames: [
        {
          mode: "verify",
          approve: "both",
          target: null,
          data: "0x",
          value: 0n,
          gas: 30_000n,
        },
        {
          mode: "sender",
          target: DEAD,
          data: "0x",
          value: 1n,
          gas: 50_000n,
          stateGas: 200_000n,
        },
      ],
      mempool: "canonical",
      chain,
      transport: http(RPC),
    });
    const mined = receipt as FrameTransactionReceipt;
    expect(mined.status).toBe("success");
    expect(mined.payer?.toLowerCase()).toBe(sender.toLowerCase());
    expect(shown.at(-1)).toMatchObject({
      kind: "frame-transaction",
      payer: "the sender",
    });
  }, 180_000);
});
