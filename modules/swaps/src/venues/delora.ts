import { ErrorException } from "@evmcrispr/sdk";
import type { Address } from "viem";
import { zeroAddress } from "viem";
import type Swaps from "..";
import type { Quote, QuoteRequest, VenueAdapter } from "./types";

const BASE_URL = "https://api.delora.build";

// Same-chain swap routing is available on these EVMcrispr-covered chains
// (GET /v1/chains lists more; extend as address books grow).
const CHAINS = new Set([1, 10, 100, 137, 8453, 42161]);

const DEFAULT_QUOTE_SLIPPAGE = 0.005;

interface DeloraQuote {
  inputAmount: string;
  outputAmount: string;
  minOutputAmount: string;
  adapter: string;
  calldata: { to: Address; data: `0x${string}`; value?: string };
  approvalAddress?: Address;
}

async function fetchQuote(
  module: Swaps,
  req: QuoteRequest & { slippage: number; recipient?: Address },
): Promise<DeloraQuote> {
  const from = req.from ?? zeroAddress;
  const search = new URLSearchParams({
    senderAddress: from,
    originChainId: String(req.chainId),
    destinationChainId: String(req.chainId),
    amount: req.amount.toString(),
    // The API accepts the zero address as the native-token marker.
    originCurrency: req.tokenIn,
    destinationCurrency: req.tokenOut,
    slippage: String(req.slippage),
  });
  if (req.recipient && req.recipient.toLowerCase() !== from.toLowerCase()) {
    search.set("receiverAddress", req.recipient);
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  const apiKey = module.getConfigBinding("deloraApiKey");
  if (apiKey) headers["x-api-key"] = String(apiKey);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/v1/quotes?${search.toString()}`, {
      headers,
    });
  } catch (err) {
    throw new ErrorException(
      `Delora quote request failed: ${err instanceof Error ? err.message : err}`,
    );
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new ErrorException(
      `Delora quote failed (HTTP ${res.status}): ${body}`,
    );
  }
  return res.json() as Promise<DeloraQuote>;
}

const delora: VenueAdapter = {
  name: "Delora",
  kind: "api",
  supportsExactOut: false,
  supports: (chainId) => CHAINS.has(chainId),

  async quote(module, req): Promise<Quote> {
    if (req.kind === "exactOut") {
      throw new ErrorException("Delora does not support exact-output swaps");
    }
    const quote = await fetchQuote(module, {
      ...req,
      slippage: DEFAULT_QUOTE_SLIPPAGE,
    });
    return { amountIn: req.amount, amountOut: BigInt(quote.outputAmount) };
  },

  async buildSwap(module, req) {
    if (req.kind === "exactOut") {
      throw new ErrorException("Delora does not support exact-output swaps");
    }
    // Always re-fetch here: the calldata embeds the route and the min-output
    // bound, so it must be requested with the swap's own slippage/recipient.
    let quote = await fetchQuote(module, {
      ...req,
      slippage: req.slippageBps / 10000,
      recipient: req.recipient,
    });
    if (BigInt(quote.minOutputAmount) < req.limit) {
      // An explicit --min is unrelated to --slippage; derive the tightest
      // slippage the quote allows and ask again before giving up.
      const output = BigInt(quote.outputAmount);
      if (output >= req.limit) {
        const derived = Number(output - req.limit) / Number(output);
        quote = await fetchQuote(module, {
          ...req,
          slippage: derived,
          recipient: req.recipient,
        });
      }
      if (BigInt(quote.minOutputAmount) < req.limit) {
        throw new ErrorException(
          `Delora could not honor the requested output bound: it guarantees ${quote.minOutputAmount} but ${req.limit} was required; lower --min/--slippage or pick another venue with --using`,
        );
      }
    }

    const nativeIn = req.tokenIn === zeroAddress;
    const value = BigInt(quote.calldata.value ?? 0);
    return {
      ...(nativeIn || !quote.approvalAddress
        ? {}
        : {
            approvalTarget: quote.approvalAddress,
            approvalAmount: req.amount,
          }),
      actions: [
        {
          to: quote.calldata.to,
          data: quote.calldata.data,
          ...(value > 0n ? { value } : {}),
        },
      ],
    };
  },
};

export default delora;
