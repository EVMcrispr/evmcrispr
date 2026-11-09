import { describe, expect, test } from "bun:test";
import { connect, createConfig, getConnection, switchChain } from "@wagmi/core";
import { http } from "viem";
import { networks } from "../../src/config/rpc";
import {
  TEST_WALLET_CONNECTOR_ID,
  testWalletConnector,
} from "../../src/wallet/test-wallet/connector";
import { createSigningQueue } from "../../src/wallet/test-wallet/queue";
import {
  createTerminalTestWallet,
  testWalletChains,
} from "../../src/wallet/test-wallet/wallet";

const ANVIL_0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

describe("the terminal's test wallet", () => {
  test("serves only the networks reached on this machine, and a local anvil only with the flag", async () => {
    const on = networks(true);
    const test = createTerminalTestWallet(
      testWalletChains(on.chains, on.rpcUrls, on.transports),
    );
    const switchTo = (id: number) =>
      test.wallet.provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${id.toString(16)}` }],
      } as never);
    for (const id of [81411, 81412, 31337]) await switchTo(id);
    // The alt-mempool devnet is 1337 through a public gateway: refused by name.
    await expect(switchTo(1337)).rejects.toThrow(
      "the Alt-mempool devnet's RPC is not on this machine",
    );
    expect(networks(false).chains.some((c) => c.id === 31337)).toBe(false);
  });

  test("its queue answers each request in turn", async () => {
    const queue = createSigningQueue();
    const seen: unknown[] = [];
    queue.subscribe(() => seen.push(queue.current()));
    const a = queue.ask({ kind: "message", hex: "0x01" } as never);
    const b = queue.ask({ kind: "message", hex: "0x02" } as never);
    const first = queue.current()!;
    expect(first).toMatchObject({ hex: "0x01" });
    queue.answer(first, false);
    // A second click meant for the first request answers nothing.
    queue.answer(first, true);
    expect(queue.current()).toMatchObject({ hex: "0x02" });
    queue.answer(queue.current()!, true);
    expect(await a).toBe(false);
    expect(await b).toBe(true);
    expect(queue.current()).toBeUndefined();
    expect(seen).toHaveLength(4);
  });

  test("connects through wagmi as anvil #0, and follows a change of account and chain", async () => {
    const on = networks(true);
    const test = createTerminalTestWallet(
      testWalletChains(on.chains, on.rpcUrls, on.transports),
    );
    const [anvil, quick] = [31337, 81411].map(
      (id) => on.chains.find((c) => c.id === id)!,
    );
    const config = createConfig({
      chains: [anvil!, quick!],
      connectors: [testWalletConnector(test.wallet)],
      transports: { 31337: http(), 81411: http() },
    });
    const connector = config.connectors.find(
      (c) => c.id === TEST_WALLET_CONNECTOR_ID,
    )!;
    expect(connector.name).toBe("Test wallet");
    const connected = await connect(config, { connector, chainId: 31337 });
    expect(connected.accounts).toEqual([ANVIL_0]);
    test.wallet.selectAccount(2);
    expect(getConnection(config).address).toBe(
      test.wallet.accounts[2]!.address,
    );
    await switchChain(config, { chainId: 81411 });
    expect(getConnection(config).chainId).toBe(81411);
  });
});
