import "../../setup";
import { beforeAll, describe, expect, it } from "bun:test";
import {
  buildSafeTx,
  encodeExecTransaction,
  encodeSafeDeployment,
  predictSafeAddress,
  preValidatedSignature,
  safeDeployment,
  safeFactoryAbi,
  safeInitializer,
} from "@evmcrispr/module-safe/transactions";
import type { Action, TransactionAction } from "@evmcrispr/sdk";
import { BindingsSpace, isTransactionAction } from "@evmcrispr/sdk";
import {
  getPublicClient,
  getTransports,
  getWalletClients,
} from "@evmcrispr/test-utils";
import { evml, Interpreter } from "@evmcrispr/test-utils/evml";
import type { Address, Hex } from "viem";
import {
  encodeFunctionData,
  erc20Abi,
  hashTypedData,
  keccak256,
  parseAbi,
  stringToHex,
  toHex,
  zeroHash,
} from "viem";
import { gnosis } from "viem/chains";
import {
  accountAbi,
  accountHistory,
  inspectAccount,
} from "../../../src/twap/account";
import {
  COMPOSABLE_COW,
  cowAbi,
  cowTwap,
  decodeSchedule,
  orderHash,
} from "../../../src/twap/cow";
import type { TwapReference } from "../../../src/twap/types";
import {
  buildOrderTypedData,
  COW_VAULT_RELAYER,
} from "../../../src/venues/lib/cowApi";
import { GNO, WXDAI } from "../../fixtures";

const tradeAbi = parseAbi([
  "struct Params { address handler; bytes32 salt; bytes staticInput; }",
  "struct Order { address sellToken; address buyToken; address receiver; uint256 sellAmount; uint256 buyAmount; uint32 validTo; bytes32 appData; uint256 feeAmount; bytes32 kind; bool partiallyFillable; bytes32 sellTokenBalance; bytes32 buyTokenBalance; }",
  "function getTradeableOrderWithSignature(address owner, Params params, bytes offchainInput, bytes32[] proof) view returns (Order order, bytes signature)",
  "function hash(Params params) pure returns (bytes32)",
  "function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)",
]);

describe("Swaps > TWAP on a Gnosis fork", () => {
  const client = getPublicClient();
  const wallet = getWalletClients()[6];
  const controller = wallet.account!.address;
  let first: TwapReference;
  let signature: Hex;
  let digest: Hex;
  const total = 12n * 10n ** 18n;
  const script = (name = "$order", extra = "") =>
    `swaps:twap ${name} ${total} ${WXDAI} to ${GNO} --parts 3 --every 3600 --min 4 --offline true ${extra}`;

  async function send(action: TransactionAction) {
    const hash = await wallet.sendTransaction({
      account: wallet.account!,
      chain: gnosis,
      to: action.to,
      data: action.data,
      value: action.value,
      gas: 5000000n,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");
    return receipt;
  }

  async function run(source: string, execute = true) {
    const interpreter = new Interpreter(evml.registry, {
      account: controller,
      transports: getTransports(),
    });
    interpreter.switchChainId(100);
    const actions = await interpreter.interpret(
      `load swaps\n${source}`,
      execute
        ? async (action: Action) => {
            if (!isTransactionAction(action))
              throw new Error("TWAP attempted a wallet/API action");
            return send(action);
          }
        : undefined,
    );
    return { interpreter, actions };
  }
  const reference = (interpreter: Interpreter, name = "$order") =>
    JSON.parse(
      interpreter.bindingsManager.getBindingValue(
        name,
        BindingsSpace.USER,
      ) as string,
    ) as TwapReference;
  const quoteRef = (ref: TwapReference) => `'${JSON.stringify(ref)}'`;
  const balance = (account: Address) =>
    client.readContract({
      address: WXDAI,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    });
  const allowance = (account: Address) =>
    client.readContract({
      address: WXDAI,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account, COW_VAULT_RELAYER],
    });

  beforeAll(async () => {
    const hash = await wallet.sendTransaction({
      account: wallet.account!,
      chain: gnosis,
      to: WXDAI,
      data: encodeFunctionData({
        abi: parseAbi(["function deposit() payable"]),
        functionName: "deposit",
      }),
      value: 100n * 10n ** 18n,
    });
    await client.waitForTransactionReceipt({ hash });
  });

  it("deploys, funds and registers an EOA-controlled Safe with a mining-time start", async () => {
    const { interpreter } = await run(script());
    first = reference(interpreter);
    expect(first.controller).toBe(controller);
    expect(first.account).not.toBe(controller);
    expect(
      await client.readContract({
        address: first.account,
        abi: accountAbi,
        functionName: "getOwners",
      }),
    ).toEqual([controller]);
    expect(await balance(first.account)).toBe(total);
    expect(await allowance(first.account)).toBe(total);
    const state = await cowTwap.status(client, first);
    expect(state.registered).toBe(true);
    expect(state.schedule).toBe("active");
    expect(state.filled).toBe("none");
    expect(BigInt(state.start!)).toBe((await client.getBlock()).timestamp);
    expect(decodeSchedule(first.params).minPartLimit).toBe(2n);
    expect(
      await client.readContract({
        address: COMPOSABLE_COW,
        abi: tradeAbi,
        functionName: "hash",
        args: [first.params],
      }),
    ).toBe(first.orderHash);
  }, 120000);

  it("produces a valid ERC-1271 order signature and distinct time parts", async () => {
    const [order, sig] = await client.readContract({
      address: COMPOSABLE_COW,
      abi: tradeAbi,
      functionName: "getTradeableOrderWithSignature",
      args: [first.account, first.params, "0x", []],
    });
    signature = sig;
    const typed = JSON.parse(
      buildOrderTypedData(100, {
        ...order,
        kind: "sell",
        sellTokenBalance: "erc20",
        buyTokenBalance: "erc20",
      }),
    );
    digest = hashTypedData(typed);
    expect(
      await client.readContract({
        address: first.account,
        abi: tradeAbi,
        functionName: "isValidSignature",
        args: [digest, signature],
      }),
    ).toBe("0x1626ba7e");
    expect(order.sellAmount).toBe(total / 3n);
    expect(order.buyAmount).toBe(2n);
    expect(order.receiver).toBe(controller);
    await client.request({
      method: "evm_increaseTime" as any,
      params: [3600] as any,
    });
    await client.request({ method: "evm_mine" as any });
    const [next] = await client.readContract({
      address: COMPOSABLE_COW,
      abi: tradeAbi,
      functionName: "getTradeableOrderWithSignature",
      args: [first.account, first.params, "0x", []],
    });
    expect(next.validTo).toBe(order.validTo + 3600);
  }, 120000);

  it("reserves different accounts for two orders encoded in one script", async () => {
    const { interpreter, actions } = await run(
      `batch (\n${script("$one")}\n${script("$two")}\n)`,
      false,
    );
    const one = reference(interpreter, "$one");
    const two = reference(interpreter, "$two");
    expect(one.account).not.toBe(two.account);
    expect(one.account).not.toBe(first.account);
    expect(actions.length).toBeGreaterThan(0);
  }, 120000);

  it("refuses recovery while live, cancels signatures, then recovers funds", async () => {
    await expect(run(`swaps:twap-recover ${quoteRef(first)}`)).rejects.toThrow(
      "still live",
    );
    await run(`swaps:twap-cancel ${quoteRef(first)}`);
    expect(await allowance(first.account)).toBe(0n);
    await expect(
      client.readContract({
        address: first.account,
        abi: tradeAbi,
        functionName: "isValidSignature",
        args: [digest, signature],
      }),
    ).rejects.toThrow();
    const before = await balance(controller);
    await run(`swaps:twap-recover ${quoteRef(first)}`);
    expect(await balance(first.account)).toBe(0n);
    expect(await balance(controller)).toBe(before + total);
  }, 120000);

  it("reuses the cleaned Safe and distinguishes expiry from fills", async () => {
    const { interpreter } = await run(script());
    const reused = reference(interpreter);
    expect(reused.account).toBe(first.account);
    await client.request({
      method: "evm_increaseTime" as any,
      params: [10800] as any,
    });
    await client.request({ method: "evm_mine" as any });
    const { interpreter: statusInterpreter } = await run(
      `set $status @swaps:twapStatus(${quoteRef(reused)})`,
      false,
    );
    const state = JSON.parse(
      statusInterpreter.bindingsManager.getBindingValue(
        "$status",
        BindingsSpace.USER,
      ) as string,
    );
    expect(state.schedule).toBe("expired");
    expect(state.filled).toBe("none");
    expect(state.remainingSellBalance).toBe(total.toString());
    // Expiry alone does not clear approvals, so the next order uses a new Safe.
    const { interpreter: next } = await run(script(), false);
    expect(reference(next).account).not.toBe(first.account);
    await run(`swaps:twap-recover ${quoteRef(reused)}`);
  }, 120000);

  it("rejects wrong controllers, wrong chains and invented references", async () => {
    await expect(
      run(
        `swaps:twap-cancel ${quoteRef({ ...first, controller: getWalletClients()[7].account!.address })}`,
      ),
    ).rejects.toThrow("original controller");
    await expect(
      run(`swaps:twap-cancel ${quoteRef({ ...first, chainId: 1 })}`),
    ).rejects.toThrow("chain 1");
    await expect(
      run(`swaps:twap-cancel ${quoteRef({ ...first, account: controller })}`),
    ).rejects.toThrow("does not match");
    const params = { ...first.params, salt: zeroHash };
    await expect(
      run(
        `swaps:twap-cancel ${quoteRef({ ...first, params, orderHash: orderHash(params) })}`,
      ),
    ).rejects.toThrow("verified order history");
  }, 120000);

  it("rejects incompatible thresholds, handlers, verifiers, guards and modules", async () => {
    const blockNumber = await client.getBlockNumber();
    for (const [fn, value] of [
      ["getThreshold", 2n],
      ["getModulesPaginated", [[controller], controller]],
      ["domainVerifiers", controller],
      ["swapGuards", controller],
      ["roots", toHex(1n, { size: 32 })],
    ] as const) {
      const altered = {
        ...client,
        readContract: async (args: any) =>
          args.functionName === fn ? value : client.readContract(args),
      };
      await expect(
        inspectAccount(
          altered as any,
          first.account,
          controller,
          100,
          blockNumber,
        ),
      ).rejects.toThrow("incompatible");
    }
    for (const name of [
      "fallback_manager.handler.address",
      "guard_manager.guard.address",
    ]) {
      const slot = keccak256(stringToHex(name));
      const altered = {
        ...client,
        getStorageAt: async (args: any) =>
          args.slot === slot
            ? toHex(BigInt(controller), { size: 32 })
            : client.getStorageAt(args),
      };
      await expect(
        inspectAccount(
          altered as any,
          first.account,
          controller,
          100,
          blockNumber,
        ),
      ).rejects.toThrow("incompatible");
    }
  }, 120000);

  it("rejects undispatched order creation even with a complete Safe nonce history", async () => {
    const nonce = await client.readContract({
      address: first.account,
      abi: accountAbi,
      functionName: "nonce",
    });
    const privateHistory = {
      ...client,
      getLogs: async (args: any) => {
        const logs = await client.getLogs(args);
        if (args.address !== first.account) return logs;
        return logs.map((log, index) =>
          index === 0
            ? {
                ...log,
                args: {
                  ...(log as any).args,
                  to: COMPOSABLE_COW,
                  operation: 0,
                  data: encodeFunctionData({
                    abi: cowAbi,
                    functionName: "create",
                    args: [first.params, false],
                  }),
                },
              }
            : log,
        );
      },
    };
    await expect(
      accountHistory(
        privateHistory as any,
        first.account,
        controller,
        100,
        nonce,
        await client.getBlockNumber(),
      ),
    ).rejects.toThrow("Private or custom conditional order");
  }, 120000);

  it("skips an account whose owner configuration has changed", async () => {
    const nonce = await client.readContract({
      address: first.account,
      abi: accountAbi,
      functionName: "nonce",
    });
    await send(
      encodeExecTransaction(
        first.account,
        buildSafeTx(
          [
            {
              to: first.account,
              data: encodeFunctionData({
                abi: parseAbi([
                  "function addOwnerWithThreshold(address owner, uint256 threshold)",
                ]),
                functionName: "addOwnerWithThreshold",
                args: [getWalletClients()[7].account!.address, 1n],
              }),
            },
          ],
          nonce,
        ),
        preValidatedSignature(controller),
      ),
    );
    const { interpreter } = await run(script(), false);
    expect(reference(interpreter).account).not.toBe(first.account);
  }, 120000);

  it("uses an enclosing Safe as controller, funder and default recipient", async () => {
    const deployment = safeDeployment(100);
    const initializer = safeInitializer(
      [controller],
      1n,
      deployment.fallbackHandler,
    );
    const bytecode = await client.readContract({
      address: deployment.proxyFactory,
      abi: safeFactoryAbi,
      functionName: "proxyCreationCode",
    });
    const salt = BigInt(Date.now());
    const outer = predictSafeAddress(deployment, bytecode, initializer, salt);
    await send(encodeSafeDeployment(deployment, initializer, salt));
    await send({
      to: WXDAI,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [outer, total],
      }),
    });
    const { interpreter } = await run(
      `load safe\nsafe:execute ${outer} (\n${script()}\n)`,
    );
    const ref = reference(interpreter);
    expect(ref.controller).toBe(outer);
    expect(decodeSchedule(ref.params).receiver).toBe(outer);
    expect(await balance(ref.account)).toBe(total);
    await run(
      `load safe\nsafe:execute ${outer} (\nswaps:twap-cancel ${quoteRef(ref)}\n)`,
    );
    await run(
      `load safe\nsafe:execute ${outer} (\nswaps:twap-recover ${quoteRef(ref)}\n)`,
    );
    expect(await balance(outer)).toBe(total);
  }, 120000);

  it("refuses reuse when RPC history is incomplete", async () => {
    const nonce = await client.readContract({
      address: first.account,
      abi: accountAbi,
      functionName: "nonce",
    });
    const incomplete = { ...client, getLogs: async () => [] };
    await expect(
      accountHistory(
        incomplete as any,
        first.account,
        controller,
        100,
        nonce,
        await client.getBlockNumber(),
      ),
    ).rejects.toThrow("Incomplete Safe execution history");
  }, 120000);

  it("honors fixed starts and narrow trading windows", async () => {
    const start = (await client.getBlock()).timestamp + 600n;
    const { interpreter } = await run(
      script("$order", `--start ${start} --window 60`),
    );
    const ref = reference(interpreter);
    expect((await cowTwap.status(client, ref)).schedule).toBe("scheduled");
    await expect(
      client.readContract({
        address: COMPOSABLE_COW,
        abi: tradeAbi,
        functionName: "getTradeableOrderWithSignature",
        args: [ref.account, ref.params, "0x", []],
      }),
    ).rejects.toThrow();
    for (const [offset, state] of [
      [0n, "active"],
      [59n, "active"],
      [60n, "between-windows"],
      [3600n, "active"],
    ] as const) {
      await client.request({
        method: "evm_setNextBlockTimestamp" as any,
        params: [Number(start + offset)] as any,
      });
      await client.request({ method: "evm_mine" as any });
      expect((await cowTwap.status(client, ref)).schedule).toBe(state);
      const read = client.readContract({
        address: COMPOSABLE_COW,
        abi: tradeAbi,
        functionName: "getTradeableOrderWithSignature",
        args: [ref.account, ref.params, "0x", []],
      });
      if (state === "between-windows") await expect(read).rejects.toThrow();
      else
        expect((await read)[0].validTo).toBe(
          Number(start + (offset / 3600n) * 3600n + 59n),
        );
    }
    await run(`swaps:twap-cancel ${quoteRef(ref)}`);
    await run(`swaps:twap-recover ${quoteRef(ref)}`);
  }, 120000);

  it("rejects missing bounds, fractions and indivisible input in the DSL", async () => {
    for (const [source, message] of [
      [`swaps:twap $order 12 ${WXDAI} to ${GNO}`, "--parts is required"],
      [
        `swaps:twap $order 12 ${WXDAI} to ${GNO} --parts 3 --every 60`,
        "Exactly one of --min or --price-protection",
      ],
      [script().replace(total.toString(), "13"), "exactly divisible"],
      [script().replace("--parts 3", "--parts 2.5"), "integer"],
      [script().replace("--every 3600", "--every 0.5"), "integer"],
      [script().replace(total.toString(), "12.5"), "integer"],
      [script("$order", "--using UniswapV3"), "does not support TWAP"],
    ])
      await expect(run(source, false)).rejects.toThrow(message);
  });

  it("registers and manages orders from an actual Aragon Agent", async () => {
    // Existing Gnosis Aragon app; permission changes are confined to this fork.
    const agent = "0x01d9c9ca040e90feb47c7513d9a3574f6e1317bd";
    const acl = "0xded166f3222bef8621b6cbce21b6ef95bed16442";
    const role = keccak256(stringToHex("RUN_SCRIPT_ROLE"));
    const aclAbi = parseAbi([
      "function getPermissionManager(address app, bytes32 role) view returns (address)",
      "function grantPermission(address entity, address app, bytes32 role)",
    ]);
    const manager = await client.readContract({
      address: acl,
      abi: aclAbi,
      functionName: "getPermissionManager",
      args: [agent, role],
    });
    const snapshot = await client.request({ method: "evm_snapshot" as any });
    try {
      await client.request({
        method: "anvil_setBalance" as any,
        params: [manager, toHex(10n ** 18n)] as any,
      });
      await client.request({
        method: "anvil_impersonateAccount" as any,
        params: [manager] as any,
      });
      const hash = (await client.request({
        method: "eth_sendTransaction" as any,
        params: [
          {
            from: manager,
            to: acl,
            data: encodeFunctionData({
              abi: aclAbi,
              functionName: "grantPermission",
              args: [controller, agent, role],
            }),
            gas: "0x1e8480",
          },
        ],
      })) as Hex;
      expect((await client.waitForTransactionReceipt({ hash })).status).toBe(
        "success",
      );
      await client.request({
        method: "anvil_stopImpersonatingAccount" as any,
        params: [manager] as any,
      });
      await send({
        to: WXDAI,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [agent, total],
        }),
      });
      const forward = (body: string) =>
        `load aragonos\naragonos:forward ${agent} (\n${body}\n)`;
      const { interpreter } = await run(forward(script()));
      const ref = reference(interpreter);
      expect(ref.controller.toLowerCase()).toBe(agent);
      expect(decodeSchedule(ref.params).receiver.toLowerCase()).toBe(agent);
      expect(await balance(ref.account)).toBe(total);
      await run(forward(`swaps:twap-cancel ${quoteRef(ref)}`));
      await run(forward(`swaps:twap-recover ${quoteRef(ref)}`));
      expect(await balance(ref.account)).toBe(0n);
    } finally {
      await client.request({
        method: "evm_revert" as any,
        params: [snapshot] as any,
      });
    }
  }, 120000);

  it("creates a TWAP inside sim:fork without wallet signing or live API submission", async () => {
    const { interpreter } = await run(
      `load sim\nsim:fork --using anvil (\n  sim:set-balance @me 100e18\n  swaps:wrap 12e18\n  ${script()}\n  set $simStatus @swaps:twapStatus($order)\n)`,
      false,
    );
    const status = JSON.parse(
      interpreter.bindingsManager.getBindingValue(
        "$simStatus",
        BindingsSpace.USER,
      ) as string,
    );
    expect(status.registered).toBe(true);
    expect(status.remainingSellBalance).toBe(total.toString());
  }, 120000);
});
