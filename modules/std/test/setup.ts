import { registerAllModules } from "@evmcrispr/test-utils";
import {
  createTestServer,
  HttpResponse,
  http,
} from "@evmcrispr/test-utils/msw/server";
import { passthrough } from "msw";
import daiAbi from "./fixtures/abis/dai.json";
import wxdaiAbi from "./fixtures/abis/wxdai.json";
import tokenList from "./fixtures/tokenlist/uniswap.json";

registerAllModules();

// Std-specific MSW handlers
const stdHandlers = [
  http.get("https://tokens.uniswap.org/", () => HttpResponse.json(tokenList)),
  http.get("https://api.evmcrispr.com/tokenlist/:chainId", () =>
    HttpResponse.json(tokenList),
  ),
  http.get(
    "https://api.evmcrispr.com/abi/:chainId/:address",
    ({ params }: { params: { address: string } }) => {
      const address = (params.address as string).toLowerCase();
      if (address === "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d") {
        return HttpResponse.json(wxdaiAbi);
      }
      if (address === "0xf8d1677c8a0c961938bf2f9adc3f3cfda759a9d9") {
        return HttpResponse.json(daiAbi);
      }
      return passthrough();
    },
  ),
];

// Create and start MSW server with shared + std handlers
export const server = createTestServer(...stdHandlers);
server.listen({ onUnhandledRequest: "bypass" });
