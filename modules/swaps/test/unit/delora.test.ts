import "../setup";
import { beforeEach, describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import type { Address } from "viem";
import delora from "../../src/venues/delora";
import type { SwapRequest } from "../../src/venues/types";
import { GNO, SOME_ADDRESS, WXDAI, ZERO_ADDRESS } from "../fixtures";
import {
  DELORA_DATA,
  DELORA_RATE,
  DELORA_TARGET,
  deloraState,
} from "../fixtures/msw-handlers";

// The adapter only touches getConfigBinding on the module.
const stubModule = { getConfigBinding: () => undefined } as any;

const AMOUNT = 100n * 10n ** 18n;

function baseRequest(overrides: Partial<SwapRequest>): SwapRequest {
  return {
    chainId: 100,
    tokenIn: WXDAI as Address,
    tokenOut: GNO as Address,
    amount: AMOUNT,
    kind: "exactIn",
    from: SOME_ADDRESS as Address,
    limit: 0n,
    slippageBps: 50,
    recipient: SOME_ADDRESS as Address,
    deadline: 1234567890n,
    ...overrides,
  };
}

describe("Swaps > venues > delora", () => {
  beforeEach(() => deloraState.reset());

  it("supports the chains in its book", () => {
    expect(delora.supports(1)).to.be.true;
    expect(delora.supports(100)).to.be.true;
    expect(delora.supports(31337)).to.be.false;
  });

  it("quotes through the aggregator API with the expected parameters", async () => {
    const quote = await delora.quote(stubModule, baseRequest({}));
    expect(quote.amountIn).to.eq(AMOUNT);
    expect(quote.amountOut).to.eq(AMOUNT * DELORA_RATE);

    const request = deloraState.requests[0];
    expect(request.senderAddress).to.eq(SOME_ADDRESS);
    expect(request.originChainId).to.eq("100");
    expect(request.destinationChainId).to.eq("100");
    expect(request.amount).to.eq(AMOUNT.toString());
    expect(request.originCurrency).to.eq(WXDAI);
    expect(request.destinationCurrency).to.eq(GNO);
  });

  it("builds the aggregator calldata with its approval target", async () => {
    const limit = (AMOUNT * DELORA_RATE * 9950n) / 10000n;
    const plan = await delora.buildSwap(stubModule, baseRequest({ limit }), {
      interpreters: {} as any,
    });
    expect(plan.approvalTarget).to.eq(DELORA_TARGET);
    expect(plan.approvalAmount).to.eq(AMOUNT);
    expect(plan.actions).to.eql([{ to: DELORA_TARGET, data: DELORA_DATA }]);
    expect(deloraState.requests[0].slippage).to.eq("0.005");
  });

  it("passes native input as value with no approval", async () => {
    const plan = await delora.buildSwap(
      stubModule,
      baseRequest({ tokenIn: ZERO_ADDRESS as Address, limit: 0n }),
      { interpreters: {} as any },
    );
    expect(plan.approvalTarget).to.be.undefined;
    expect(plan.actions).to.eql([
      { to: DELORA_TARGET, data: DELORA_DATA, value: AMOUNT },
    ]);
  });

  it("re-quotes with a derived slippage to honor a tight --min", async () => {
    // limit == full quoted output: only satisfiable at slippage 0.
    const limit = AMOUNT * DELORA_RATE;
    const plan = await delora.buildSwap(stubModule, baseRequest({ limit }), {
      interpreters: {} as any,
    });
    expect(plan.actions).to.have.length(1);
    expect(deloraState.requests).to.have.length(2);
    expect(deloraState.requests[1].slippage).to.eq("0");
  });

  it("fails loudly when the bound cannot be honored", async () => {
    const limit = AMOUNT * DELORA_RATE + 1n; // above the quoted output
    let error: Error | null = null;
    try {
      await delora.buildSwap(stubModule, baseRequest({ limit }), {
        interpreters: {} as any,
      });
    } catch (err: any) {
      error = err;
    }
    expect(error!.message).to.include("could not honor");
  });

  it("rejects exact-output requests", async () => {
    let error: Error | null = null;
    try {
      await delora.quote(stubModule, baseRequest({ kind: "exactOut" }));
    } catch (err: any) {
      error = err;
    }
    expect(error!.message).to.include("exact-output");
  });
});
