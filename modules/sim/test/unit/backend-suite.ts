import { beforeAll, describe, expect, it } from "bun:test";
import type { Action } from "@evmcrispr/sdk";
import {
  createPublicClient,
  encodeErrorResult,
  getAddress,
  getContractAddress,
  keccak256,
  type PublicClient,
  parseAbi,
} from "viem";
import { gnosis } from "viem/chains";
import {
  anvilUrl,
  CHAIN_ID,
  getEndpoint,
  getForkBlockNumber,
  loadEnv,
} from "../../../../scripts/anvil-config";
import {
  fetchForkBlock,
  type SimBackend,
  type SimBackendOpts,
} from "../../src/lib/backend";

const FORK_BLOCK_NUMBER = await getForkBlockNumber();

const ADDR = "0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6";
const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";

// Init code deploying a 10-byte runtime that returns 42.
const RUNTIME = "0x602a60005260206000f3" as const;
const INITCODE = `0x600a600c600039600a6000f3${RUNTIME.slice(2)}` as const;

/**
 * Conformance suite for in-process simulation backends. Both the ethereumjs
 * and revm backends must pass it with identical observable behavior; `prefix`
 * is the backend's admin-RPC cheatcode prefix (methods are suffix-matched, so
 * any prefix works — the suite uses the backend's canonical one).
 */
export function describeBackendSuite(
  name: string,
  prefix: string,
  createBackend: (opts: SimBackendOpts) => Promise<SimBackend>,
  { simContext = true }: { simContext?: boolean } = {},
): void {
  let rpcUrl: string;

  async function makeBackend(
    blockNumber?: number,
  ): Promise<{ backend: SimBackend; client: PublicClient }> {
    const backend = await createBackend({
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

  describe(name, () => {
    beforeAll(async () => {
      await loadEnv();
      const endpoint = getEndpoint();
      if (!endpoint)
        throw new Error(
          "EVMCRISPR_RPC_URL_100 or VITE_DRPC_API_KEY is required",
        );
      // Fork the runner's already pinned Anvil, rather than making every
      // backend repeat the same public RPC reads (and race rate limits).
      rpcUrl = anvilUrl();
    });

    // -------------------------------------------------------------------------
    // Creation
    // -------------------------------------------------------------------------

    it("creates backend with explicit block number", async () => {
      const { backend } = await makeBackend(FORK_BLOCK_NUMBER);
      expect(backend).toBeDefined();
      expect(backend.transport).toBeDefined();
      expect(typeof backend.handleAction).toBe("function");
    });

    it("creates backend resolving latest block", async () => {
      const backend = await createBackend({
        upstreamRpcUrl: rpcUrl,
        chainId: CHAIN_ID,
      });
      expect(backend).toBeDefined();
    });

    // -------------------------------------------------------------------------
    // Transport: basic RPC responses
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // handleAction: setBalance
    // -------------------------------------------------------------------------

    it("setBalance sets balance readable via eth_getBalance", async () => {
      const { backend, client } = await makeBackend();
      const amount = 123456789000000000000n;
      await backend.handleAction({
        type: "rpc",
        method: `${prefix}_setBalance`,
        params: [ADDR, `0x${amount.toString(16)}`],
      });

      const balance = await client.getBalance({ address: ADDR });
      expect(balance).toBe(amount);
    });

    // -------------------------------------------------------------------------
    // handleAction: setCode
    // -------------------------------------------------------------------------

    it("setCode sets code readable via eth_getCode", async () => {
      const { backend, client } = await makeBackend();
      const bytecode = "0x600160005260206000f3";
      await backend.handleAction({
        type: "rpc",
        method: `${prefix}_setCode`,
        params: [ADDR, bytecode],
      });

      const code = await client.getCode({ address: ADDR });
      expect(code).toBeDefined();
      expect(code!.length).toBeGreaterThan(2);
    });

    // -------------------------------------------------------------------------
    // handleAction: setStorageAt
    // -------------------------------------------------------------------------

    it("CHAINID is the forked chain's id, in a call and in a transaction", async () => {
      const { backend, client } = await makeBackend();
      const reader = getAddress("0x00000000000000000000000000000000000c4a1d");
      // Returns CHAINID; with calldata, stores it at slot 0 instead.
      await backend.handleAction({
        type: "rpc",
        method: `${prefix}_setCode`,
        params: [reader, "0x3615600957465f55005b465f5260205ff3"],
      });
      const answer = await client.call({ to: reader, data: "0x" });
      expect(BigInt(answer.data ?? "0x0")).toBe(BigInt(CHAIN_ID));
      await backend.handleAction({ to: reader, from: ADDR, data: "0x01" });
      const stored = await client.getStorageAt({
        address: reader,
        slot: "0x0",
      });
      expect(BigInt(stored ?? "0x0")).toBe(BigInt(CHAIN_ID));
    });

    it("setStorageAt sets storage readable via eth_getStorageAt", async () => {
      const { backend, client } = await makeBackend();
      const slot =
        "0x0000000000000000000000000000000000000000000000000000000000000001";
      const value =
        "0x00000000000000000000000000000000000000000000000000000000000000ff";
      await backend.handleAction({
        type: "rpc",
        method: `${prefix}_setStorageAt`,
        params: [ADDR, slot, value],
      });

      const stored = await client.getStorageAt({ address: ADDR, slot });
      expect(stored).toBe(value);
    });

    // -------------------------------------------------------------------------
    // handleAction: evm_increaseTime
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // handleAction: mine
    // -------------------------------------------------------------------------

    it("mine increments block number", async () => {
      const { backend, client } = await makeBackend();
      const before = await client.getBlockNumber();
      await backend.handleAction({
        type: "rpc",
        method: `${prefix}_mine`,
        params: ["0x3"],
      });
      const after = await client.getBlockNumber();
      expect(after).toBe(before + 3n);
    });

    // -------------------------------------------------------------------------
    // handleAction: TransactionAction (state-changing call)
    // -------------------------------------------------------------------------

    it("reports where a transaction's value went, through internal calls", async () => {
      const { backend } = await makeBackend();
      const forwarder = getAddress(
        "0x00000000000000000000000000000000000f0a01",
      );
      const payee = getAddress("0x00000000000000000000000000000000000f0a02");
      // CALL(gas, payee, callvalue, 0, 0, 0, 0); STOP: the payee is in the
      // code, not in the transaction.
      await backend.handleAction({
        type: "rpc",
        method: `${prefix}_setCode`,
        params: [forwarder, `0x60006000600060003473${payee.slice(2)}5af100`],
      });
      await backend.handleAction({
        type: "rpc",
        method: `${prefix}_setBalance`,
        params: [ADDR, "0xde0b6b3a7640000"],
      });
      const receipt = await backend.handleAction({
        to: forwarder,
        from: ADDR,
        value: 4n,
      });
      const changes = Object.fromEntries(
        (receipt?.balanceChanges ?? []).map((c) => [
          getAddress(c.address),
          c.after - c.before,
        ]),
      );
      // The forwarder passed it on: its balance did not change.
      expect(changes).toEqual({ [getAddress(ADDR)]: -4n, [payee]: 4n });
    });

    // -------------------------------------------------------------------------
    // Fees: a transaction that gives them pays its gas used; one that gives
    // none runs free
    // -------------------------------------------------------------------------

    // Gnosis' base fee is a few wei: the tip is of the same size.
    const TIP = 3n;
    const slot0 = async (client: PublicClient, address: `0x${string}`) => {
      const word = await client.getStorageAt({ address, slot: "0x0" });
      return !word || word === "0x" ? 0n : BigInt(word);
    };
    const PAYEE = getAddress("0x00000000000000000000000000000000000fee02");
    async function feeBackend() {
      const made = await makeBackend();
      const { baseFee } = await fetchForkBlock(
        rpcUrl,
        BigInt(FORK_BLOCK_NUMBER),
      );
      await made.backend.handleAction({
        type: "rpc",
        method: `${prefix}_setBalance`,
        params: [ADDR, "0xde0b6b3a7640000"],
      });
      return { ...made, baseFee };
    }
    const changesOf = (
      receipt: Awaited<ReturnType<SimBackend["handleAction"]>>,
    ) =>
      Object.fromEntries(
        (receipt?.balanceChanges ?? []).map((c) => [
          getAddress(c.address),
          c.after - c.before,
        ]),
      );

    it("a transaction that gives fees pays its gas used at the base fee plus its tip", async () => {
      const { backend, client, baseFee } = await feeBackend();
      expect(baseFee).toBeGreaterThan(0n);
      const before = await client.getBalance({ address: ADDR });
      const receipt = await backend.handleAction({
        to: PAYEE,
        from: ADDR,
        value: 4n,
        maxFeePerGas: baseFee * 2n + TIP,
        maxPriorityFeePerGas: TIP,
      });
      const fee = receipt!.gasUsed! * (baseFee + TIP);
      expect(receipt!.gasUsed).toBe(21_000n);
      expect(await client.getBalance({ address: ADDR })).toBe(
        before - 4n - fee,
      );
      // The fee is in what the transaction changed; no block producer is paid.
      expect(changesOf(receipt)).toEqual({
        [getAddress(ADDR)]: -4n - fee,
        [PAYEE]: 4n,
      });
    });

    it("a max fee caps the price, and the tip alone sets the max fee to the base fee plus it", async () => {
      const { backend, client, baseFee } = await feeBackend();
      const start = await client.getBalance({ address: ADDR });
      await backend.handleAction({
        to: PAYEE,
        from: ADDR,
        maxFeePerGas: baseFee + 1n,
        maxPriorityFeePerGas: TIP,
      });
      const capped = await client.getBalance({ address: ADDR });
      expect(capped).toBe(start - 21_000n * (baseFee + 1n));
      await backend.handleAction({
        to: PAYEE,
        from: ADDR,
        maxPriorityFeePerGas: TIP,
      });
      expect(await client.getBalance({ address: ADDR })).toBe(
        capped - 21_000n * (baseFee + TIP),
      );
    });

    it("a transaction that gives no fee runs free, and sees a zero gas price", async () => {
      const { backend, client } = await feeBackend();
      const reader = getAddress("0x00000000000000000000000000000000000fee03");
      // GASPRICE PUSH0 SSTORE STOP
      await backend.handleAction({
        type: "rpc",
        method: `${prefix}_setCode`,
        params: [reader, "0x3a5f5500"],
      });
      const before = await client.getBalance({ address: ADDR });
      await backend.handleAction({ to: reader, from: ADDR, value: 4n });
      expect(await client.getBalance({ address: ADDR })).toBe(before - 4n);
      expect(await slot0(client, reader)).toBe(0n);
    });

    it("a call sees the price a transaction with fees pays (GASPRICE)", async () => {
      const { backend, client, baseFee } = await feeBackend();
      const reader = getAddress("0x00000000000000000000000000000000000fee03");
      await backend.handleAction({
        type: "rpc",
        method: `${prefix}_setCode`,
        params: [reader, "0x3a5f5500"],
      });
      await backend.handleAction({
        to: reader,
        from: ADDR,
        maxFeePerGas: baseFee * 2n,
        maxPriorityFeePerGas: TIP,
      });
      expect(await slot0(client, reader)).toBe(baseFee + TIP);
    });

    it("refuses a max fee below the base fee, and a tip above the max fee", async () => {
      const { backend, baseFee } = await feeBackend();
      await expect(
        backend.handleAction({
          to: PAYEE,
          from: ADDR,
          maxFeePerGas: baseFee - 1n,
        }),
      ).rejects.toThrow(/is below the base fee/);
      await expect(
        backend.handleAction({
          to: PAYEE,
          from: ADDR,
          maxFeePerGas: baseFee * 2n,
          maxPriorityFeePerGas: baseFee * 2n + 1n,
        }),
      ).rejects.toThrow(/is higher than the max fee per gas/);
    });

    it("refuses a sender that cannot pay for its gas used, and keeps nothing of it", async () => {
      const { backend, client, baseFee } = await feeBackend();
      const poor = getAddress("0x00000000000000000000000000000000000fee04");
      await backend.handleAction({
        type: "rpc",
        method: `${prefix}_setBalance`,
        params: [poor, "0x1000"],
      });
      await expect(
        backend.handleAction({
          to: PAYEE,
          from: poor,
          value: 1n,
          maxFeePerGas: baseFee,
        }),
      ).rejects.toThrow(`${poor} cannot pay the fee: the gas used costs`);
      expect(await client.getBalance({ address: poor })).toBe(0x1000n);
      expect(await client.getBalance({ address: PAYEE })).toBe(0n);
    });

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

    // -------------------------------------------------------------------------
    // handleAction: plain CREATE deployment
    // -------------------------------------------------------------------------

    it("deploys plain CREATE contracts at successive account nonces", async () => {
      const { backend, client } = await makeBackend();
      const txCount = await client.getTransactionCount({
        address: ADDR,
        blockNumber: BigInt(FORK_BLOCK_NUMBER),
      });

      const receipt = await backend.handleAction({
        from: ADDR,
        data: INITCODE,
      } as Action);
      const first = getContractAddress({ from: ADDR, nonce: BigInt(txCount) });
      expect(await client.getCode({ address: first })).toBe(RUNTIME);
      // The receipt names the contract, as a node's does.
      expect(receipt?.contractAddress?.toLowerCase()).toBe(first.toLowerCase());

      // A second deploy must land at exactly the next nonce — catches any
      // double nonce accounting in the backend.
      await backend.handleAction({ from: ADDR, data: INITCODE } as Action);
      const second = getContractAddress({
        from: ADDR,
        nonce: BigInt(txCount + 1),
      });
      expect(await client.getCode({ address: second })).toBe(RUNTIME);
    });

    it("honors an explicit tx nonce for CREATE address derivation", async () => {
      const { backend, client } = await makeBackend();
      const txCount = await client.getTransactionCount({
        address: ADDR,
        blockNumber: BigInt(FORK_BLOCK_NUMBER),
      });
      const nonce = txCount + 7;

      await backend.handleAction({
        from: ADDR,
        data: INITCODE,
        nonce,
      } as Action);
      const at = getContractAddress({ from: ADDR, nonce: BigInt(nonce) });
      expect(await client.getCode({ address: at })).toBe(RUNTIME);
    });

    // -------------------------------------------------------------------------
    // handleAction: reverting transaction
    // -------------------------------------------------------------------------

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

    it("decodes the on-chain revert reason into the error message", async () => {
      const { backend } = await makeBackend();
      const reverter = "0x00000000000000000000000000000000000e1118";
      const payload = encodeErrorResult({
        abi: parseAbi(["error Error(string)"]),
        errorName: "Error",
        args: ["nope"],
      });
      // Runtime: CODECOPY(dest=0, offset=12, len); REVERT(0, len) — the
      // ABI-encoded Error("nope") payload sits after the 12 code bytes.
      const len = ((payload.length - 2) / 2).toString(16).padStart(2, "0");
      const bytecode = `0x60${len}600c60003960${len}6000fd${payload.slice(2)}`;

      await backend.handleAction({
        type: "rpc",
        method: `${prefix}_setCode`,
        params: [reverter, bytecode],
      });

      // The message is exactly the decoded reason — no generic
      // "Transaction reverted:" prefix when the revert carries data.
      const err = await backend
        .handleAction({
          from: ADDR,
          to: reverter,
          data: "0x",
        } as Action)
        .then(() => null)
        .catch((e: Error) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err!.message).toBe("nope");
    });

    // -------------------------------------------------------------------------
    // eth_call reads modified state
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // eth_call does not persist state
    // -------------------------------------------------------------------------

    it("eth_call does not persist state changes", async () => {
      const { backend, client } = await makeBackend();

      const amount = 500000000000000000000n;
      await backend.handleAction({
        type: "rpc",
        method: `${prefix}_setBalance`,
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

    // -------------------------------------------------------------------------
    // Unsupported RPC method
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // handleAction: synthetic receipts
    // -------------------------------------------------------------------------

    it("returns a synthetic receipt with logs for transactions", async () => {
      const { backend } = await makeBackend();
      const emitter = "0x00000000000000000000000000000000000e1117";
      const topic = `0x${"ab".repeat(32)}` as const;
      // PUSH32 <topic> PUSH1 0 PUSH1 0 LOG1 STOP — emits one empty-data LOG1.
      const bytecode = `0x7f${topic.slice(2)}60006000a100`;

      const setCodeReceipt = await backend.handleAction({
        type: "rpc",
        method: `${prefix}_setCode`,
        params: [emitter, bytecode],
      });
      expect(setCodeReceipt).toBeUndefined();

      const receipt = await backend.handleAction({
        from: ADDR,
        to: emitter,
        data: "0x",
      } as Action);

      expect(receipt).toBeDefined();
      expect(receipt!.status).toBe("success");
      expect(receipt!.logs).toHaveLength(1);
      expect(receipt!.logs[0].address.toLowerCase()).toBe(emitter);
      expect(receipt!.logs[0].topics).toEqual([topic]);
      expect(receipt!.logs[0].data).toBe("0x");
    });

    // -------------------------------------------------------------------------
    // A module action's simulation context
    // -------------------------------------------------------------------------

    describe.skipIf(!simContext)("a module action's simulation context", () => {
      const CALLER = "0x1000000000000000000000000000000000000001";
      const TARGET = "0x2000000000000000000000000000000000000002";
      const DEAD = "0x000000000000000000000000000000000000dEaD";
      const ACTION = {
        type: "module",
        module: "probe",
        kind: "ping",
        chainId: CHAIN_ID,
        from: CALLER,
        data: {},
        description: { title: "", detail: "", meta: "", steps: [], notes: [] },
      } as unknown as Action;

      async function host(runtime: `0x${string}`) {
        const { backend } = await makeBackend();
        await backend.handleAction({
          type: "rpc",
          method: `${prefix}_setCode`,
          params: [TARGET, runtime],
        } as Action);
        await backend.handleAction({
          type: "rpc",
          method: `${prefix}_setBalance`,
          params: [CALLER, "0xde0b6b3a7640000"],
        } as Action);
        expect(backend.simContext).toBeDefined();
        return backend.simContext!(ACTION, { onLog: () => {} });
      }
      const call = (
        sim: Awaited<ReturnType<typeof host>>,
        over: { isStatic?: boolean; value?: bigint; to?: `0x${string}` } = {},
      ) =>
        sim.call({
          caller: CALLER,
          to: over.to ?? TARGET,
          data: "0x",
          value: over.value ?? 0n,
          gas: 1_000_000n,
          isStatic: over.isStatic ?? false,
        });
      const word = (n: number): `0x${string}` =>
        `0x${n.toString(16).padStart(64, "0")}`;

      it("runs an added opcode, which pops its operands and pushes its answer", async () => {
        // PUSH1 7, 0xb0, PUSH1 0, MSTORE, PUSH1 32, PUSH1 0, RETURN
        const sim = await host("0x6007b060005260206000f3");
        const seen: unknown[] = [];
        const result = await sim.withOpcodes(
          [
            {
              opcode: 0xb0,
              name: "TIMES_SIX",
              pops: 1,
              run: (input) => {
                seen.push(input);
                return { push: input.operands[0]! * 6n };
              },
            },
          ],
          () => call(sim),
        );
        expect(result.success).toBe(true);
        expect(result.returnData).toBe(word(42));
        expect(seen[0]).toMatchObject({
          operands: [7n],
          isStatic: false,
        });
        expect((seen[0] as { address: string }).address.toLowerCase()).toBe(
          TARGET.toLowerCase(),
        );
        // Without it, the byte is an invalid opcode again.
        expect((await call(sim)).success).toBe(false);
      });

      it("an opcode can end the call like RETURN, write memory, or fail", async () => {
        // PUSH1 42, PUSH1 0, MSTORE, 0xaa (returns memory[0..32]), INVALID
        const ret = await host("0x602a600052aafe");
        const returned = await ret.withOpcodes(
          [
            {
              opcode: 0xaa,
              name: "END",
              pops: 0,
              run: () => ({ return: { offset: 0n, size: 32n } }),
            },
          ],
          () => call(ret),
        );
        expect(returned).toMatchObject({ success: true, returnData: word(42) });

        // 0xb2 (writes 42 at 0), PUSH1 32, PUSH1 0, RETURN
        const write = await host("0xb260206000f3");
        const written = await write.withOpcodes(
          [
            {
              opcode: 0xb2,
              name: "WRITE",
              pops: 0,
              run: () => ({
                write: { offset: 0n, data: word(42) as `0x${string}` },
              }),
            },
          ],
          () => call(write),
        );
        expect(written).toMatchObject({ success: true, returnData: word(42) });

        const fail = await host("0xb000");
        const failed = await fail.withOpcodes(
          [
            {
              opcode: 0xb0,
              name: "NO",
              pops: 0,
              run: () => ({ fail: "not here" }),
            },
          ],
          () => call(fail),
        );
        expect(failed.success).toBe(false);
      });

      it("a static call cannot write; the same call can when not static", async () => {
        // PUSH1 1, PUSH1 0, SSTORE, STOP
        const sim = await host(
          "0x6001600055 00".replace(" ", "") as `0x${string}`,
        );
        expect((await call(sim, { isStatic: true })).success).toBe(false);
        expect((await call(sim)).success).toBe(true);
      });

      it("knows the forked block's base fee; setBalance sets a balance", async () => {
        const sim = await host("0x00");
        const { baseFee } = await fetchForkBlock(
          rpcUrl,
          BigInt(FORK_BLOCK_NUMBER),
        );
        expect(sim.baseFee).toBe(baseFee);
        await sim.setBalance(CALLER, 12345n);
        expect(await sim.getBalance(CALLER)).toBe(12345n);
      });

      it("reports the net state changes since its first checkpoint, sorted", async () => {
        // SSTORE(0, calldata word 0); value goes with the call.
        const sim = await host("0x5f355f5500");
        await sim.checkpoint();
        const store = (n: number) =>
          sim.call({
            caller: CALLER,
            to: TARGET,
            data: word(n),
            value: 0n,
            gas: 100_000n,
            isStatic: false,
          });
        expect((await call(sim, { to: DEAD, value: 4n })).success).toBe(true);
        expect((await store(1)).success).toBe(true);
        expect((await store(2)).success).toBe(true);
        const changes = await sim.stateChanges();
        const lower = (a: string) => a.toLowerCase();
        expect(changes.balances.map((b) => lower(b.address))).toEqual(
          [lower(DEAD), lower(CALLER)].sort(),
        );
        const dead = changes.balances.find(
          (b) => lower(b.address) === lower(DEAD),
        )!;
        expect(dead.after - dead.before).toBe(4n);
        expect(changes.slots).toHaveLength(1);
        expect(lower(changes.slots[0]!.address)).toBe(lower(TARGET));
        expect(BigInt(changes.slots[0]!.slot)).toBe(0n);
        expect(BigInt(changes.slots[0]!.after)).toBe(2n);
        expect(changes.codes).toEqual([]);
        await sim.commit();
      });

      it("reports a contract created since its first checkpoint, by its code hash", async () => {
        const sim = await host("0x00");
        await sim.checkpoint();
        // The CREATE2 deployer: salt ‖ init code.
        const created = await sim.call({
          caller: CALLER,
          to: "0x4e59b44847b379578588920cA78FbF26c0B4956C",
          data: `0x${"00".repeat(31)}07${INITCODE.slice(2)}`,
          value: 0n,
          gas: 1_000_000n,
          isStatic: false,
        });
        expect(created.success).toBe(true);
        const changes = await sim.stateChanges();
        expect(changes.codes).toHaveLength(1);
        expect(changes.codes[0]!.after).toBe(keccak256(RUNTIME));
        await sim.commit();
      });

      it("a call leaves the caller's nonce; setNonce sets it", async () => {
        const sim = await host("0x00");
        const before = await sim.getNonce(CALLER);
        await call(sim);
        expect(await sim.getNonce(CALLER)).toBe(before);
        await sim.setNonce(CALLER, before + 3n);
        expect(await sim.getNonce(CALLER)).toBe(before + 3n);
      });

      it("one action's calls share what they warmed, as one transaction's frames do", async () => {
        // PUSH1 0, SLOAD, POP, STOP: reads slot 0 of the target.
        const sim = await host("0x6000545000");
        expect(sim.isWarm(TARGET)).toBe(false);
        const first = await call(sim);
        expect(sim.isWarm(TARGET)).toBe(true);
        const second = await call(sim);
        // The slot was cold (2100) for the first call, warm (100) after.
        expect(first.gasUsed - second.gasUsed).toBe(2_000n);
        sim.warm(DEAD);
        expect(sim.isWarm(DEAD)).toBe(true);
      });

      it("a call cannot send more than the caller has", async () => {
        const sim = await host("0x00");
        const result = await call(sim, { to: DEAD, value: 10n ** 30n });
        expect(result.success).toBe(false);
        expect(await sim.getBalance(DEAD)).toBeLessThan(10n ** 30n);
      });

      it("a call keeps the nonce its CREATEs used", async () => {
        // PUSH1 0, PUSH1 0, PUSH1 0, CREATE, POP, STOP: the target creates
        // an empty contract when it calls itself, as a sender frame does.
        const sim = await host("0x600060006000f05000");
        const before = await sim.getNonce(TARGET);
        const result = await sim.call({
          caller: TARGET,
          to: TARGET,
          data: "0x",
          value: 0n,
          gas: 1_000_000n,
          isStatic: false,
        });
        expect(result.success).toBe(true);
        expect(await sim.getNonce(TARGET)).toBe(before + 1n);
      });

      it("revert undoes the calls since its checkpoint; commit keeps them", async () => {
        const sim = await host("0x00");
        const start = await sim.getBalance(DEAD);
        await sim.checkpoint();
        expect((await call(sim, { to: DEAD, value: 5n })).success).toBe(true);
        expect((await call(sim, { to: DEAD, value: 6n })).success).toBe(true);
        expect(await sim.getBalance(DEAD)).toBe(start + 11n);
        await sim.revert();
        expect(await sim.getBalance(DEAD)).toBe(start);
        await sim.checkpoint();
        await call(sim, { to: DEAD, value: 5n });
        await sim.commit();
        expect(await sim.getBalance(DEAD)).toBe(start + 5n);
        expect(await sim.getCode(TARGET)).toBe("0x00");
      });

      describe("EIP-7708 transfer logs (transferLogs)", () => {
        const SYSTEM = "0xfffffffffffffffffffffffffffffffffffffffe";
        const TRANSFER =
          "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
        const REVERTER = "0x3000000000000000000000000000000000000003";
        const pad = (a: string) =>
          `0x${a.slice(2).toLowerCase().padStart(64, "0")}`;
        const hex20 = (a: string) => a.slice(2).toLowerCase();
        const transfer = (from: string, to: string, value: bigint) => ({
          address: SYSTEM,
          topics: [TRANSFER, pad(from), pad(to)],
          data: word(Number(value)),
        });
        const lower = (
          logs: { address: string; topics: string[]; data: string }[],
        ) =>
          logs.map((l) => ({
            address: l.address.toLowerCase(),
            topics: l.topics.map((t) => t.toLowerCase()),
            data: l.data.toLowerCase(),
          }));
        async function run(
          runtime: `0x${string}`,
          value: bigint,
          transferLogs: boolean,
          to: `0x${string}` = TARGET,
        ) {
          const { backend } = await makeBackend();
          for (const [address, code] of [
            [TARGET, runtime],
            [REVERTER, "0x5f5ffd"],
          ] as const)
            await backend.handleAction({
              type: "rpc",
              method: `${prefix}_setCode`,
              params: [address, code],
            } as Action);
          await backend.handleAction({
            type: "rpc",
            method: `${prefix}_setBalance`,
            params: [CALLER, "0xde0b6b3a7640000"],
          } as Action);
          const sim = backend.simContext!(ACTION, { onLog: () => {} });
          // As a deployed contract's: its first CREATE uses nonce 1.
          await sim.setNonce(TARGET, 1n);
          const result = await sim.call({
            caller: CALLER,
            to,
            data: "0x",
            value,
            gas: 1_000_000n,
            isStatic: false,
            transferLogs,
          });
          expect(result.success).toBe(true);
          return lower(result.logs);
        }

        it("logs the call's own value, before the logs of the code it runs; none without the option", async () => {
          expect(await run("0x00", 7n, true, DEAD)).toEqual([
            transfer(CALLER, DEAD, 7n),
          ]);
          expect(await run("0x00", 7n, false, DEAD)).toEqual([]);
          expect(await run("0x00", 0n, true, DEAD)).toEqual([]);
        });

        it("logs a CALL's value where it moves, and drops a reverted one's", async () => {
          // LOG0; CALL 0x…dEaD with 2 wei; CALL the reverter with 3 wei.
          const relay =
            `0x5f5fa05f5f5f5f600273${hex20(DEAD)}5af1505f5f5f5f600373${hex20(REVERTER)}5af15000` as const;
          expect(await run(relay, 10n, true)).toEqual([
            transfer(CALLER, TARGET, 10n),
            { address: TARGET.toLowerCase(), topics: [], data: "0x" },
            transfer(TARGET, DEAD, 2n),
          ]);
        });

        it("logs a CREATE's value to the created account, and a SELFDESTRUCT's to its beneficiary", async () => {
          const created = getContractAddress({ from: TARGET, nonce: 1n });
          expect(await run("0x5f5f6004f05000", 10n, true)).toEqual([
            transfer(CALLER, TARGET, 10n),
            transfer(TARGET, created, 4n),
          ]);
          expect(await run(`0x73${hex20(DEAD)}ff`, 5n, true)).toEqual([
            transfer(CALLER, TARGET, 5n),
            transfer(TARGET, DEAD, 5n),
          ]);
        });
      });

      describe("the Hegota devnet's gas schedule (schedule: hegota)", () => {
        // SSTORE(0, calldata word 0)
        const WRITER = "0x5f355f5500" as const;
        const store = (
          sim: Awaited<ReturnType<typeof host>>,
          n: number,
          over: { stateGas?: bigint; schedule?: "hegota" } = {
            schedule: "hegota",
            stateGas: 400_000n,
          },
        ) =>
          sim.call({
            caller: CALLER,
            to: TARGET,
            data: word(n),
            value: 0n,
            gas: 100_000n,
            isStatic: false,
            ...over,
          });

        it("prices a new slot as ethrex does: 3000 cold, 10000 to write, 64 x 1530 state gas", async () => {
          const sim = await host(WRITER);
          await sim.checkpoint();
          const result = await store(sim, 5);
          expect(result.success).toBe(true);
          // PUSH0 CALLDATALOAD PUSH0: 7.
          expect(result.gasUsed).toBe(13_007n);
          expect(result.stateGasUsed).toBe(97_920n);
        });

        it("fails a call whose state budget is 1 gas short, and counts no state gas", async () => {
          const sim = await host(WRITER);
          await sim.checkpoint();
          const result = await store(sim, 5, {
            schedule: "hegota",
            stateGas: 97_919n,
          });
          expect(result.success).toBe(false);
          expect(result.stateGasUsed ?? 0n).toBe(0n);
        });

        it("never gives the pool back: a slot set, cleared, then another set, with the budget for one, fails", async () => {
          // SSTORE(0, 1); SSTORE(0, 0); SSTORE(1, 1)
          const sim = await host("0x60015f555f5f55600160015500");
          await sim.checkpoint();
          const result = await store(sim, 0, {
            schedule: "hegota",
            stateGas: 97_920n,
          });
          expect(result.success).toBe(false);
        });

        it("emits no Burn log: a contract created with value that destructs to itself logs only the transfers (as ethrex)", async () => {
          // CALLDATACOPY; CREATE(value 4, calldata); the init code is
          // SELFDESTRUCT(ADDRESS).
          const sim = await host("0x365f5f37365f6004f05000");
          await sim.checkpoint();
          const result = await sim.call({
            caller: CALLER,
            to: TARGET,
            data: "0x30ff",
            value: 10n,
            gas: 400_000n,
            isStatic: false,
            transferLogs: true,
            schedule: "hegota",
            stateGas: 400_000n,
          });
          expect(result.success).toBe(true);
          const BURN =
            "0xcc16f5dbb4873280815c1ee09dbd06736cffcc184412cf7a71a0fdb75d397ca5";
          expect(
            result.logs.filter((l) => l.topics[0]?.toLowerCase() === BURN),
          ).toEqual([]);
          expect(result.logs).toHaveLength(2);
        });

        it("leaves the forked chain's own rules without it", async () => {
          const sim = await host(WRITER);
          await sim.checkpoint();
          const result = await store(sim, 5, {});
          expect(result.success).toBe(true);
          expect(result.gasUsed).toBe(22_107n);
          expect(result.stateGasUsed).toBeUndefined();
        });
      });

      it("a group that rolls back keeps none of its storage writes, under the transaction's checkpoints", async () => {
        // As a frame transaction's atomic group runs: the transaction's
        // checkpoint, the body's, the group's; two frames write a slot, the
        // third fails, the group reverts and the rest commits.
        const { backend, client } = await makeBackend();
        await backend.handleAction({
          type: "rpc",
          method: `${prefix}_setCode`,
          params: [TARGET, "0x5f355f5500"], // SSTORE(0, calldata word 0)
        } as Action);
        await backend.handleAction({
          type: "rpc",
          method: `${prefix}_setBalance`,
          params: [CALLER, "0xde0b6b3a7640000"],
        } as Action);
        const sim = backend.simContext!(ACTION, { onLog: () => {} });
        await sim.checkpoint();
        await sim.checkpoint();
        await sim.checkpoint();
        const store = await sim.call({
          caller: CALLER,
          to: TARGET,
          data: word(7),
          value: 0n,
          gas: 100_000n,
          isStatic: false,
        });
        expect(store.success).toBe(true);
        const again = await sim.call({
          caller: CALLER,
          to: TARGET,
          data: word(9),
          value: 0n,
          gas: 100_000n,
          isStatic: false,
        });
        expect(again.success).toBe(true);
        const fails = await call(sim, { to: DEAD, value: 10n ** 30n });
        expect(fails.success).toBe(false);
        await sim.revert();
        expect((await sim.stateChanges()).slots).toEqual([]);
        await sim.commit();
        await sim.commit();
        expect(
          BigInt(
            (await client.getStorageAt({ address: TARGET, slot: word(0) }))!,
          ),
        ).toBe(0n);
      });
    });
  });
}
