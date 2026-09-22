import "../../setup";
import { afterEach, describe, expect, it } from "bun:test";
import {
  BindingsSpace,
  findDeclaredError,
  isTransactionAction,
} from "@evmcrispr/sdk";
import {
  getPublicClient,
  getTransports,
  getWalletClients,
} from "@evmcrispr/test-utils";
import {
  evml,
  expectDeclaredFailure,
  Interpreter,
} from "@evmcrispr/test-utils/evml";
import { HttpResponse, http } from "@evmcrispr/test-utils/msw/server";
import { toHex } from "viem";
import { gnosis } from "viem/chains";
import { decodeSchedule } from "../../../src/twap/cow";
import { protectedMinimum } from "../../../src/twap/preflight";
import type { TwapReference } from "../../../src/twap/types";
import { GNO, WXDAI } from "../../fixtures";
import { COW_MOCK_BUY_AMOUNT, cowState } from "../../fixtures/msw-handlers";
import { server } from "../../setup";

describe("TWAP > creation preflight", () => {
  const client = getPublicClient();
  const wallet = getWalletClients()[8];
  const source = (opts: string) =>
    `swaps:twap $order 12e18 ${WXDAI} to ${GNO} --parts 3 --every 3600 ${opts}`;
  const reference = (interpreter: Interpreter) =>
    JSON.parse(
      interpreter.bindingsManager.getBindingValue(
        "$order",
        BindingsSpace.USER,
      ) as string,
    ) as TwapReference;
  async function run(body: string, execute = false) {
    const interpreter = new Interpreter(evml.registry, {
      account: wallet.account!.address,
      transports: getTransports(),
    });
    interpreter.switchChainId(100);
    const actions = await interpreter.interpret(
      `load swaps\n${body}`,
      execute
        ? async (action) => {
            if (!isTransactionAction(action))
              throw new Error("Unexpected off-chain action");
            const hash = await wallet.sendTransaction({
              account: wallet.account!,
              chain: gnosis,
              to: action.to,
              data: action.data,
              value: action.value,
              gas: 5_000_000n,
            });
            const receipt = await client.waitForTransactionReceipt({ hash });
            expect(receipt.status).toBe("success");
            return receipt;
          }
        : undefined,
    );
    return { interpreter, actions };
  }
  afterEach(() => {
    server.resetHandlers();
    cowState.reset();
  });

  it("freezes the quoted net limit and quotes the execution Safe with the selected recipient", async () => {
    const { interpreter, actions } = await run(
      source(`--price-protection 0.01 --to ${GNO}`),
    );
    const ref = reference(interpreter);
    expect(decodeSchedule(ref.params).minPartLimit).toBe(
      protectedMinimum(COW_MOCK_BUY_AMOUNT, 1n),
    );
    expect(cowState.quoteRequests.at(-1)).toMatchObject({
      from: ref.account,
      receiver: GNO,
      sellAmountBeforeFee: "4000000000000000000",
      signingScheme: "eip1271",
      priceQuality: "verified",
    });
    expect(actions.every(isTransactionAction)).toBe(true);
    expect(cowState.orders).toHaveLength(0);
  }, 120000);

  it("permits a fixed minimum above today's quote and never silently makes it cheaper", async () => {
    const { interpreter } = await run(source("--min 300e18"));
    expect(decodeSchedule(reference(interpreter).params).minPartLimit).toBe(
      100n * 10n ** 18n,
    );
  }, 120000);

  it("rejects conflicting limits and requires explicit offline mode inside simulation", async () => {
    for (const [opts, error] of [
      ["", "Exactly one"],
      ["--min 1 --price-protection 1", "Exactly one"],
      ["--price-protection 1 --offline true", "requires --min"],
    ])
      await expect(run(source(opts))).rejects.toThrow(error);
    await expect(
      run(`load sim\nsim:fork --using anvil (\n${source("--min 1")}\n)`),
    ).rejects.toThrow("explicit --offline");
    expect(cowState.quoteRequests).toHaveLength(0);
  }, 120000);

  it("returns no funding actions when the live API rejects the token or rate limits the request", async () => {
    for (const status of [400, 429]) {
      server.use(
        http.post(
          "https://api.cow.fi/xdai/api/v1/quote",
          () => new HttpResponse(null, { status }),
        ),
      );
      await expect(run(source("--min 1"), true)).rejects.toThrow(
        `HTTP ${status}`,
      );
    }
  }, 120000);

  it("refuses a part below the network minimum with BelowMinimum", async () => {
    // 0.1 WXDAI per part is 0.1 USDC at the mocked native prices, below
    // Gnosis' 1 USDC minimum.
    const small = `swaps:twap $order 3e17 ${WXDAI} to ${GNO} --parts 3 --every 3600 --min 1`;
    await expectDeclaredFailure(
      () => run(small),
      { name: "BelowMinimum", fields: { minimum: 1_000000 } },
      "a part worth 0.1 USDC",
      /1 USDC-equivalent minimum/,
    );
    // The field is what the script destructures, in USDC base units.
    const { interpreter } = await run(`${small} -?!> BelowMinimum [$minimum]`);
    expect(
      interpreter.bindingsManager.getBindingValue(
        "$minimum",
        BindingsSpace.USER,
      ),
    ).toBe("1000000");
  }, 120000);

  it("refuses an order CoW declines to quote with NoQuote", async () => {
    server.use(
      http.post("https://api.cow.fi/xdai/api/v1/quote", () =>
        HttpResponse.json(
          {
            errorType: "UnsupportedToken",
            description: "token not supported",
          },
          { status: 400 },
        ),
      ),
    );
    await expectDeclaredFailure(
      () => run(source("--min 1")),
      { name: "NoQuote" },
      "a token CoW does not support",
      /UnsupportedToken/,
    );
    const { interpreter, actions } = await run(
      `${source("--min 1")} -?!> NoQuote $skipped`,
    );
    expect(actions).toEqual([]);
    expect(
      interpreter.bindingsManager.getBindingValue(
        "$skipped",
        BindingsSpace.USER,
      ),
    ).toBe("true");
  }, 120000);

  it("lets a failing quote service through a named capture", async () => {
    const captured = `${source("--min 1")} -?!> NoQuote -?!> BelowMinimum -?!> SameToken`;
    for (const [what, response] of [
      [
        "an upstream outage",
        () =>
          HttpResponse.json(
            { errorType: "InternalServerError", description: "boom" },
            { status: 500 },
          ),
      ],
      [
        "a malformed body",
        () => new HttpResponse("<html>gateway</html>", { status: 200 }),
      ],
      [
        "a quote CoW could not verify",
        () =>
          HttpResponse.json(
            { errorType: "QuoteNotVerified", description: "unverified" },
            { status: 400 },
          ),
      ],
    ] as const) {
      server.use(http.post("https://api.cow.fi/xdai/api/v1/quote", response));
      const thrown = await run(captured).then(
        () => new Error(`${what} was swallowed by the named captures`),
        (error: unknown) => error,
      );
      expect(findDeclaredError(thrown)).toBeUndefined();
      expect((thrown as Error).message).not.toContain("was swallowed");
    }
  }, 120000);

  it("rechecks a reused Safe after slow external calls and rejects a changed nonce", async () => {
    const snapshot = await client.request({ method: "evm_snapshot" as any });
    try {
      const { interpreter } = await run(
        `swaps:wrap 12e18\n${source("--min 1 --offline true")}`,
        true,
      );
      const ref = reference(interpreter);
      const arg = `'${JSON.stringify(ref)}'`;
      await run(`swaps:twap-cancel ${arg}\nswaps:twap-recover ${arg}`, true);
      server.use(
        http.post("https://programmatic-orders.cow.fi/graphql", async () => {
          // Safe v1.4.1 stores nonce in slot 5. Mutate only the local fork.
          await client.request({
            method: "anvil_setStorageAt" as any,
            params: [
              ref.account,
              toHex(5n, { size: 32 }),
              toHex(99n, { size: 32 }),
            ] as any,
          });
          await client.request({ method: "evm_mine" as any });
          return HttpResponse.json({
            data: { programmaticOrders: { items: [], totalCount: 0 } },
          });
        }),
      );
      await expect(run(source("--min 1"))).rejects.toThrow(
        "changed during preflight",
      );
    } finally {
      await client.request({
        method: "evm_revert" as any,
        params: [snapshot] as any,
      });
    }
  }, 120000);
});
