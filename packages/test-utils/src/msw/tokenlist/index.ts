import { HttpResponse, http } from "msw";
import tokenList from "./uniswap.json";

export { tokenList };

export const tokenlistHandlers = [
  http.get("https://tokens.uniswap.org/", () => HttpResponse.json(tokenList)),
  http.get("https://api.evmcrispr.com/tokenlist/:chainId", () =>
    HttpResponse.json(tokenList),
  ),
];

/** The default token list answering with `tokens` instead: a list that
 *  changed, or lies, after a script was written. Pass it to `server.use`
 *  and undo it with `server.resetHandlers`. */
export const tokenlistOf = (
  tokens: { symbol: string; chainId: number; address: string }[],
) =>
  http.get("https://api.evmcrispr.com/tokenlist/:chainId", () =>
    HttpResponse.json({ tokens }),
  );
