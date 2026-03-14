import "../setup";
import { beforeAll, describe, expect, it } from "bun:test";
import type { Action } from "@evmcrispr/sdk";
import { createPublicClient, type PublicClient } from "viem";
import { gnosis } from "viem/chains";
import {
  CHAIN_ID,
  FORK_BLOCK_NUMBER,
  getEndpoint,
  loadEnv,
} from "../../../../scripts/anvil-config";
import {
  createEthereumJSBackend,
  type EthereumJSBackend,
} from "../../src/lib/ethereumjs-backend";

const ADDR = "0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6";
const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";

let rpcUrl: string;

async function makeBackend(
  blockNumber?: number,
): Promise<{ backend: EthereumJSBackend; client: PublicClient }> {
  const backend = await createEthereumJSBackend({
    upstreamRpcUrl: rpcUrl,
    blockNumber: blockNumber ?? FORK_BLOCK_NUMBER,
    chainId: CHAIN_ID,
  });
  const client = createPublicClient({
    chain: gnosis,
    transport: backend.transport,
    cacheTime: 0,
  });
  return { backend, client };
}

describe("EthereumJS Backend (unit)", () => {
  beforeAll(async () => {
    await loadEnv();
    const endpoint = getEndpoint();
    if (!endpoint) throw new Error("VITE_DRPC_API_KEY is required");
    rpcUrl = endpoint;
  });

  // ---------------------------------------------------------------------------
  // Creation
  // ---------------------------------------------------------------------------

  it("creates backend with explicit block number", async () => {
    const { backend } = await makeBackend(FORK_BLOCK_NUMBER);
    expect(backend).toBeDefined();
    expect(backend.transport).toBeDefined();
    expect(typeof backend.handleAction).toBe("function");
  });

  it("creates backend resolving latest block", async () => {
    const backend = await createEthereumJSBackend({
      upstreamRpcUrl: rpcUrl,
      chainId: CHAIN_ID,
    });
    expect(backend).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Transport: basic RPC responses
  // ---------------------------------------------------------------------------

  it("transport responds to eth_chainId", async () => {
    const { client } = await makeBackend();
    const chainId = await client.getChainId();
    expect(chainId).toBe(CHAIN_ID);
  });

  it("transport responds to eth_blockNumber", async () => {
    const { client } = await makeBackend();
    const blockNumber = await client.getBlockNumber();
    expect(blockNumber).toBe(BigInt(FORK_BLOCK_NUMBER));
  });

  // ---------------------------------------------------------------------------
  // handleAction: setBalance
  // ---------------------------------------------------------------------------

  it("setBalance sets balance readable via eth_getBalance", async () => {
    const { backend, client } = await makeBackend();
    const amount = 123456789000000000000n;
    await backend.handleAction({
      type: "rpc",
      method: "ethereumjs_setBalance",
      params: [ADDR, `0x${amount.toString(16)}`],
    });

    const balance = await client.getBalance({ address: ADDR });
    expect(balance).toBe(amount);
  });

  // ---------------------------------------------------------------------------
  // handleAction: setCode
  // ---------------------------------------------------------------------------

  it("setCode sets code readable via eth_getCode", async () => {
    const { backend, client } = await makeBackend();
    const bytecode = "0x600160005260206000f3";
    await backend.handleAction({
      type: "rpc",
      method: "ethereumjs_setCode",
      params: [ADDR, bytecode],
    });

    const code = await client.getCode({ address: ADDR });
    expect(code).toBeDefined();
    expect(code!.length).toBeGreaterThan(2);
  });

  // ---------------------------------------------------------------------------
  // handleAction: setStorageAt
  // ---------------------------------------------------------------------------

  it("setStorageAt sets storage readable via eth_getStorageAt", async () => {
    const { backend, client } = await makeBackend();
    const slot =
      "0x0000000000000000000000000000000000000000000000000000000000000001";
    const value =
      "0x00000000000000000000000000000000000000000000000000000000000000ff";
    await backend.handleAction({
      type: "rpc",
      method: "ethereumjs_setStorageAt",
      params: [ADDR, slot, value],
    });

    const stored = await client.getStorageAt({ address: ADDR, slot });
    expect(stored).toBe(value);
  });

  // ---------------------------------------------------------------------------
  // handleAction: evm_increaseTime
  // ---------------------------------------------------------------------------

  it("evm_increaseTime does not change block number", async () => {
    const { backend, client } = await makeBackend();
    const before = await client.getBlockNumber();
    await backend.handleAction({
      type: "rpc",
      method: "evm_increaseTime",
      params: ["0xe10"],
    });
    const after = await client.getBlockNumber();
    expect(after).toBe(before);
  });

  // ---------------------------------------------------------------------------
  // handleAction: mine
  // ---------------------------------------------------------------------------

  it("mine increments block number", async () => {
    const { backend, client } = await makeBackend();
    const before = await client.getBlockNumber();
    await backend.handleAction({
      type: "rpc",
      method: "ethereumjs_mine",
      params: ["0x3"],
    });
    const after = await client.getBlockNumber();
    expect(after).toBe(before + 3n);
  });

  // ---------------------------------------------------------------------------
  // handleAction: TransactionAction (state-changing call)
  // ---------------------------------------------------------------------------

  it("executes a transaction action (approve on WXDAI)", async () => {
    const { backend } = await makeBackend();
    const approveData =
      "0x095ea7b3" +
      "000000000000000000000000000000000000000000000000000000000000dead" +
      "0000000000000000000000000000000000000000000000000de0b6b3a7640000";

    const action: Action = {
      to: WXDAI,
      data: approveData as `0x${string}`,
      from: ADDR,
    };

    await backend.handleAction(action);
  });

  // ---------------------------------------------------------------------------
  // handleAction: reverting transaction
  // ---------------------------------------------------------------------------

  it("throws on reverting transaction", async () => {
    const { backend } = await makeBackend();
    // withdraw(uint256) on WXDAI: sender has no WXDAI so require() fails
    const withdrawData =
      "0x2e1a7d4d" +
      "0000000000000000000000000000000000000000000000000000000000000001";
    const action: Action = {
      to: WXDAI,
      data: withdrawData as `0x${string}`,
      from: ADDR,
    };

    await expect(backend.handleAction(action)).rejects.toThrow(
      "Transaction reverted",
    );
  });

  // ---------------------------------------------------------------------------
  // eth_call reads modified state
  // ---------------------------------------------------------------------------

  it("eth_call reads state modified by a prior transaction", async () => {
    const { backend, client } = await makeBackend();

    const spender = "0x000000000000000000000000000000000000dEaD";
    const amount = 1000000000000000000n;
    const approveData =
      "0x095ea7b3" +
      "000000000000000000000000000000000000000000000000000000000000dead" +
      "0000000000000000000000000000000000000000000000000de0b6b3a7640000";

    await backend.handleAction({
      to: WXDAI,
      data: approveData as `0x${string}`,
      from: ADDR,
    });

    const allowance = await client.readContract({
      address: WXDAI,
      abi: [
        {
          type: "function",
          name: "allowance",
          inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
          ],
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
        },
      ],
      functionName: "allowance",
      args: [ADDR, spender],
    });

    expect(allowance).toBe(amount);
  });

  // ---------------------------------------------------------------------------
  // eth_call does not persist state
  // ---------------------------------------------------------------------------

  it("eth_call does not persist state changes", async () => {
    const { backend, client } = await makeBackend();

    const amount = 500000000000000000000n;
    await backend.handleAction({
      type: "rpc",
      method: "ethereumjs_setBalance",
      params: [ADDR, `0x${amount.toString(16)}`],
    });

    const balanceBefore = await client.getBalance({ address: ADDR });
    expect(balanceBefore).toBe(amount);

    // eth_call (readContract) should not change state even if we query something
    await client.readContract({
      address: WXDAI,
      abi: [
        {
          type: "function",
          name: "balanceOf",
          inputs: [{ name: "", type: "address" }],
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
        },
      ],
      functionName: "balanceOf",
      args: [ADDR],
    });

    const balanceAfter = await client.getBalance({ address: ADDR });
    expect(balanceAfter).toBe(amount);
  });

  // ---------------------------------------------------------------------------
  // Unsupported RPC method
  // ---------------------------------------------------------------------------

  it("throws on unsupported RPC method", async () => {
    const { backend } = await makeBackend();
    await expect(
      backend.handleAction({
        type: "rpc",
        method: "unsupported_method",
        params: [],
      }),
    ).rejects.toThrow("Unsupported RPC method");
  });
});
