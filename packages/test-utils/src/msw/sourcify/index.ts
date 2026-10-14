import { HttpResponse, http } from "msw";
import { isAddress } from "viem";
import router from "./sourcify-uniswap-v2-router02.json";
import usdc from "./sourcify-usdc-proxy.json";

/**
 * Sourcify v2 answers by `<chainId>:<lowercased address>`, recorded from
 * `GET https://sourcify.dev/server/v2/contract/1/<address>?fields=abi,compilation,sources,proxyResolution`
 * on 2026-10-14 (the Router's file contents cut to 300 characters).
 * Tests may add entries for a run and delete them after.
 */
export const sourcifyFixtures: Record<string, Record<string, unknown>> = {
  "1:0x7a250d5630b4cf539739df2c5dacb4c659f2488d": router,
  "1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": usdc,
};

/**
 * Sourcify's v2 contract lookup, which the sdk asks first when it has
 * neither an Etherscan key nor a proxy. Honours `fields` (a comma list) the
 * way Sourcify does; any address without a fixture is Sourcify's `404`,
 * which sends the sdk on to the EVMcrispr API.
 */
export const sourcifyHandlers = [
  http.get<{ chainId: string; address: string }>(
    "https://sourcify.dev/server/v2/contract/:chainId/:address",
    ({ params, request }) => {
      const { chainId, address } = params;
      if (!isAddress(address, { strict: false }))
        return HttpResponse.json(
          { customCode: "invalid_parameter", message: "invalid address" },
          { status: 400 },
        );
      const fixture = sourcifyFixtures[`${chainId}:${address.toLowerCase()}`];
      if (!fixture)
        return HttpResponse.json(
          {
            match: null,
            creationMatch: null,
            runtimeMatch: null,
            chainId,
            address,
          },
          { status: 404 },
        );
      const fields = new URL(request.url).searchParams.get("fields");
      const keep = new Set([
        "match",
        "creationMatch",
        "runtimeMatch",
        "chainId",
        "address",
        ...(fields?.split(",") ?? []),
      ]);
      return HttpResponse.json(
        Object.fromEntries(
          Object.entries(fixture).filter(([field]) => keep.has(field)),
        ),
      );
    },
  ),
];
