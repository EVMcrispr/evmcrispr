import { HttpResponse, http } from "msw";
import tokenList from "./uniswap.json";

export { tokenList };

export const tokenlistHandlers = [
  http.get("https://tokens.uniswap.org/", () => HttpResponse.json(tokenList)),
  http.get("https://api.evmcrispr.com/tokenlist/:chainId", () =>
    HttpResponse.json(tokenList),
  ),
];
