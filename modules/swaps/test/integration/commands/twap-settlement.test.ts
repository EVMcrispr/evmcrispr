import "../../setup";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import {
  BindingsSpace,
  isTransactionAction,
  type TransactionAction,
} from "@evmcrispr/sdk";
import {
  getPublicClient,
  getTransports,
  getWalletClients,
} from "@evmcrispr/test-utils";
import { evml, Interpreter } from "@evmcrispr/test-utils/evml";
import { HttpResponse, http } from "@evmcrispr/test-utils/msw/server";
import type { Hex } from "viem";
import { concatHex, encodeFunctionData, erc20Abi, parseAbi, toHex } from "viem";
import { gnosis } from "viem/chains";
import { COMPOSABLE_COW, cowTwap } from "../../../src/twap/cow";
import {
  findRegistration,
  type ObservationBlock,
  settlementAbi,
} from "../../../src/twap/evidence";
import { partOrder, partUid } from "../../../src/twap/parts";
import { twapSnapshot } from "../../../src/twap/status";
import type { TwapReference } from "../../../src/twap/types";
import { COW_SETTLEMENT } from "../../../src/venues/lib/cowApi";
import { GNO, WXDAI } from "../../fixtures";
import { server } from "../../setup";

const tradeableAbi = parseAbi([
  "struct Params { address handler; bytes32 salt; bytes staticInput; }",
  "struct Order { address sellToken; address buyToken; address receiver; uint256 sellAmount; uint256 buyAmount; uint32 validTo; bytes32 appData; uint256 feeAmount; bytes32 kind; bool partiallyFillable; bytes32 sellTokenBalance; bytes32 buyTokenBalance; }",
  "function getTradeableOrderWithSignature(address owner, Params params, bytes offchainInput, bytes32[] proof) view returns (Order order, bytes signature)",
]);
const settleAbi = parseAbi([
  "struct Trade { uint256 sellTokenIndex; uint256 buyTokenIndex; address receiver; uint256 sellAmount; uint256 buyAmount; uint32 validTo; bytes32 appData; uint256 feeAmount; uint256 flags; uint256 executedAmount; bytes signature; }",
  "struct Interaction { address target; uint256 value; bytes callData; }",
  "function settle(address[] tokens, uint256[] clearingPrices, Trade[] trades, Interaction[][3] interactions)",
  "function authenticator() view returns (address)",
  "function freeFilledAmountStorage(bytes[] orderUids)",
]);
const authAbi = parseAbi([
  "function manager() view returns (address)",
  "function addSolver(address solver)",
]);

describe("TWAP > actual CoW settlement on a Gnosis fork", () => {
  const client = getPublicClient();
  const wallet = getWalletClients()[9];
  const owner = wallet.account!.address;
  let snapshot: Hex;
  let ref: TwapReference;
  let start: bigint;
  let firstTrade: Awaited<ReturnType<typeof trade>>;
  let firstFillTx: Hex;
  const total = 12n * 10n ** 18n;
  const refArg = () => `'${JSON.stringify(ref)}'`;

  async function send(action: TransactionAction, success = true) {
    const hash = await wallet.sendTransaction({
      account: wallet.account!,
      chain: gnosis,
      to: action.to,
      data: action.data,
      value: action.value,
      gas: 5_000_000n,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe(success ? "success" : "reverted");
    return receipt;
  }
  async function run(body: string) {
    const interpreter = new Interpreter(evml.registry, {
      account: owner,
      transports: getTransports(),
    });
    interpreter.switchChainId(100);
    await interpreter.interpret(`load swaps\n${body}`, async (action) => {
      if (!isTransactionAction(action))
        throw new Error("Unexpected non-transaction action");
      return send(action);
    });
    return interpreter;
  }
  async function trade() {
    const [order, signature] = await client.readContract({
      address: COMPOSABLE_COW,
      abi: tradeableAbi,
      functionName: "getTradeableOrderWithSignature",
      args: [ref.account, ref.params, "0x", []],
    });
    return {
      sellTokenIndex: 0n,
      buyTokenIndex: 1n,
      receiver: order.receiver,
      sellAmount: order.sellAmount,
      buyAmount: order.buyAmount,
      validTo: order.validTo,
      appData: order.appData,
      feeAmount: order.feeAmount,
      flags: 64n,
      executedAmount: 0n,
      signature: concatHex([ref.account, signature]),
    };
  }
  const settle = (
    value: Awaited<ReturnType<typeof trade>>,
    buyPrice = 10n ** 18n,
  ): TransactionAction => ({
    to: COW_SETTLEMENT,
    data: encodeFunctionData({
      abi: settleAbi,
      functionName: "settle",
      args: [[WXDAI, GNO], [1n, buyPrice], [value], [[], [], []]],
    }),
  });
  async function advance(time: bigint) {
    await client.request({
      method: "evm_setNextBlockTimestamp" as any,
      params: [Number(time)] as any,
    });
    await client.request({ method: "evm_mine" as any });
  }

  beforeAll(async () => {
    snapshot = (await client.request({ method: "evm_snapshot" as any })) as Hex;
    const auth = await client.readContract({
      address: COW_SETTLEMENT,
      abi: settleAbi,
      functionName: "authenticator",
    });
    const manager = await client.readContract({
      address: auth,
      abi: authAbi,
      functionName: "manager",
    });
    // Only the fork's allowlist is modified; all signature and settlement logic
    // runs in the real deployed contracts, without mocked Trade events.
    await client.request({
      method: "anvil_impersonateAccount" as any,
      params: [manager] as any,
    });
    await client.request({
      method: "anvil_setBalance" as any,
      params: [manager, toHex(10n ** 18n)] as any,
    });
    try {
      const hash = (await client.request({
        method: "eth_sendTransaction" as any,
        params: [
          {
            from: manager,
            to: auth,
            data: encodeFunctionData({
              abi: authAbi,
              functionName: "addSolver",
              args: [owner],
            }),
            gas: "0x1e8480",
          },
        ],
      })) as Hex;
      expect((await client.waitForTransactionReceipt({ hash })).status).toBe(
        "success",
      );
    } finally {
      await client.request({
        method: "anvil_stopImpersonatingAccount" as any,
        params: [manager] as any,
      });
    }
    await run(
      `swaps:wrap 50e18\nswaps:swap 1e18 ${WXDAI} to ${GNO} --min 1 --using Honeyswap --to ${COW_SETTLEMENT}`,
    );
  }, 120000);
  afterAll(async () => {
    if (snapshot)
      await client.request({
        method: "evm_revert" as any,
        params: [snapshot] as any,
      });
  });
  afterEach(() => server.resetHandlers());

  it("registers a schedule and distinguishes no fills from a missing history", async () => {
    const interpreter = await run(
      `swaps:twap $order ${total} ${WXDAI} to ${GNO} --parts 3 --every 60 --min 6 --offline true`,
    );
    ref = JSON.parse(
      interpreter.bindingsManager.getBindingValue(
        "$order",
        BindingsSpace.USER,
      ) as string,
    );
    const state = await cowTwap.status(client, ref);
    start = BigInt(state.start!);
    expect(state.filled).toBe("none");
    expect(state.evidence.complete).toBe(true);
    const unavailable = await cowTwap.status(
      { ...client, getLogs: async () => [] } as any,
      ref,
    );
    expect(unavailable.filled).toBe("unknown");
    expect(unavailable.evidence.complete).toBe(false);
  }, 120000);

  it("rejects a below-limit settlement, fills a part, then rejects a replay", async () => {
    firstTrade = await trade();
    await send(settle(firstTrade, 3n * 10n ** 18n), false);
    const receipt = await send(settle(firstTrade));
    firstFillTx = receipt.transactionHash;
    await send(settle(firstTrade), false);
    const uid = partUid(ref, start, 0n);
    expect(
      await client.readContract({
        address: COW_SETTLEMENT,
        abi: settlementAbi,
        functionName: "filledAmount",
        args: [uid],
      }),
    ).toBe(total / 3n);
    const state = await cowTwap.status(client, ref);
    expect(state.filled).toBe("partial");
    expect(state.filledParts).toBe(1);
    expect(state.executedSellAmount).toBe((total / 3n).toString());
    expect(state.executedBuyAmount).toBe("4");
    const saved = await client.request({ method: "evm_snapshot" as any });
    try {
      await advance(start + 181n);
      const expired = await cowTwap.status(client, ref);
      expect(expired.schedule).toBe("expired");
      expect(expired.filled).toBe("partial");
      expect(expired.filledParts).toBe(1);
    } finally {
      await client.request({
        method: "evm_revert" as any,
        params: [saved] as any,
      });
    }
    await expect(run(`swaps:twap-recover ${refArg()}`)).rejects.toThrow(
      "not proven fully filled",
    );
  }, 120000);

  it("does not trust API completion, duplicates, or an empty balance", async () => {
    server.use(
      http.get("https://api.cow.fi/xdai/api/v2/trades", () =>
        HttpResponse.json(
          Array(3).fill({
            orderUid: partUid(ref, start, 0n),
            txHash: firstFillTx,
          }),
        ),
      ),
    );
    const state = await cowTwap.status(client, ref, { external: true });
    expect(state.filled).toBe("partial");
    expect(state.filledParts).toBe(1);
    expect(state.submission.state).toBe("not-observed");
    const incomplete = await cowTwap.status(
      {
        ...client,
        getLogs: async (args: any) => {
          if (args.address === COW_SETTLEMENT)
            throw new Error("archive range unavailable");
          return client.getLogs(args);
        },
      } as any,
      ref,
      { external: true },
    );
    expect(incomplete.filled).toBe("unknown");
    expect(incomplete.filledParts).toBe(1);
    expect(incomplete.evidence.complete).toBe(false);
    const fakeBalance = {
      ...client,
      readContract: async (args: any) =>
        args.functionName === "balanceOf" ? 0n : client.readContract(args),
    };
    expect((await cowTwap.status(fakeBalance as any, ref)).filled).toBe(
      "partial",
    );
  }, 120000);

  it("reports submission separately and returns bounded part pages", async () => {
    const registration = await findRegistration(
      client,
      ref,
      (await client.getBlock()) as ObservationBlock,
    );
    server.use(
      http.post("https://programmatic-orders.cow.fi/graphql", () =>
        HttpResponse.json({
          data: {
            programmaticOrders: {
              items: [
                {
                  chainId: 100,
                  owner: ref.account,
                  hash: ref.orderHash,
                  txHash: registration.transactionHash,
                  status: "Completed",
                },
              ],
              totalCount: 1,
            },
          },
        }),
      ),
    );
    const discovered = await cowTwap.status(client, ref, { external: true });
    expect(discovered.discovery).toBe("observed");
    expect(discovered.submission.state).toBe("not-observed");
    expect(discovered.filled).toBe("partial");
    server.resetHandlers();
    server.use(
      http.post("https://api.cow.fi/xdai/api/v1/orders/by_uids", () =>
        HttpResponse.json([
          {
            order: {
              ...partOrder(ref, start, 0n),
              sellAmount: (total / 3n).toString(),
              buyAmount: "2",
              feeAmount: "0",
              uid: partUid(ref, start, 0n),
              owner: ref.account,
              signingScheme: "eip1271",
              status: "fulfilled",
            },
          },
        ]),
      ),
    );
    const submitted = await cowTwap.status(client, ref, { external: true });
    expect(submitted.discovery).toBe("not-observed");
    expect(submitted.submission.state).toBe("observed");
    expect(submitted.filled).toBe("partial");
    await expect(
      twapSnapshot(client, ref, {}, { offset: 0, limit: 0xffffffff }),
    ).rejects.toThrow("128");
    const snapshot = await twapSnapshot(
      client,
      ref,
      {},
      { offset: 0, limit: 2 },
    );
    expect(snapshot.items).toHaveLength(2);
    expect(snapshot.nextOffset).toBe(2);
    expect(snapshot.items[0].uid).toBe(partUid(ref, start, 0n));
    expect(snapshot.items[0].settlement?.transactionHash).toBe(firstFillTx);
    const interpreter = await run(
      `set $page @swaps:twapParts(${refArg()} 1 1)`,
    );
    const page = JSON.parse(
      interpreter.bindingsManager.getBindingValue(
        "$page",
        BindingsSpace.USER,
      ) as string,
    );
    expect(page.items[0].index).toBe(1);
    expect(page.nextOffset).toBe(2);
  }, 120000);

  it("proves all fills before expiry even with donated sell tokens remaining", async () => {
    await send({
      to: WXDAI,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [ref.account, 1n],
      }),
    });
    for (let part = 1n; part < 3n; part++) {
      await advance(start + part * 60n);
      await send(settle(await trade()));
    }
    const state = await cowTwap.status(client, ref);
    expect(state.schedule).toBe("active");
    expect(state.filled).toBe("complete");
    expect(state.filledParts).toBe(3);
    expect(state.remainingSellBalance).toBe("1");
    expect(state.executedSellAmount).toBe(total.toString());
    await run(`swaps:twap-recover ${refArg()}`);
    const recovered = await cowTwap.status(client, ref);
    expect(recovered.registered).toBe(false);
    expect(recovered.filled).toBe("complete");
    expect(recovered.start).toBe(start.toString());
    expect(recovered.remainingSellBalance).toBe("0");
    expect(recovered.allowance).toBe("0");
  }, 120000);

  it("preserves fill history after expired fill-counter storage is freed", async () => {
    await advance(start + 181n);
    const uids = [0n, 1n, 2n].map((part) => partUid(ref, start, part));
    await send({
      to: COW_SETTLEMENT,
      data: encodeFunctionData({
        abi: settleAbi,
        functionName: "settle",
        args: [
          [],
          [],
          [],
          [
            [],
            [],
            [
              {
                target: COW_SETTLEMENT,
                value: 0n,
                callData: encodeFunctionData({
                  abi: settleAbi,
                  functionName: "freeFilledAmountStorage",
                  args: [uids],
                }),
              },
            ],
          ],
        ],
      }),
    });
    expect(
      await client.readContract({
        address: COW_SETTLEMENT,
        abi: settlementAbi,
        functionName: "filledAmount",
        args: [uids[0]],
      }),
    ).toBe(0n);
    expect((await cowTwap.status(client, ref)).filled).toBe("complete");
  }, 120000);

  it("invalidates a generated signature on cancellation and keeps previous orders isolated during reuse", async () => {
    const previous = ref;
    const interpreter = await run(
      `swaps:twap $order ${total} ${WXDAI} to ${GNO} --parts 3 --every 60 --min 6 --offline true`,
    );
    ref = JSON.parse(
      interpreter.bindingsManager.getBindingValue(
        "$order",
        BindingsSpace.USER,
      ) as string,
    );
    expect(ref.account).toBe(previous.account);
    const pending = await trade();
    let apiCalls = 0;
    server.use(
      http.all("https://api.cow.fi/*", () => {
        apiCalls++;
        return new HttpResponse(null, { status: 503 });
      }),
      http.all("https://programmatic-orders.cow.fi/*", () => {
        apiCalls++;
        return new HttpResponse(null, { status: 503 });
      }),
    );
    await run(`swaps:twap-cancel ${refArg()}`);
    await send(settle(pending), false);
    expect((await cowTwap.status(client, ref)).filled).toBe("none");
    expect((await cowTwap.status(client, previous)).filled).toBe("complete");
    await run(`swaps:twap-recover ${refArg()}`);
    expect(apiCalls).toBe(0);
  }, 120000);

  it("discards evidence if the observation block is reorganized", async () => {
    const block = (await client.getBlock()) as ObservationBlock;
    const reorganized = {
      ...client,
      getBlock: async (args: any) =>
        args?.blockNumber === block.number
          ? { ...block, hash: `0x${"22".repeat(32)}` }
          : client.getBlock(args),
    };
    const state = await cowTwap.status(reorganized as any, ref, { block });
    expect(state.filled).toBe("unknown");
    expect(state.evidence.complete).toBe(false);
    expect(state.finality).toBe("unknown");
  }, 120000);
});
