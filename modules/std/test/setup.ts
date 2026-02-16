import { registerAllModules } from "@evmcrispr/test-utils";
import {
  createTestServer,
  HttpResponse,
  http,
} from "@evmcrispr/test-utils/msw/server";
import tokenList from "./fixtures/tokenlist/uniswap.json";
import wxdaiAbi from "./fixtures/abis/wxdai.json";

registerAllModules();

// Std-specific MSW handlers
const stdHandlers = [
  http.get("https://tokens.uniswap.org/", () => HttpResponse.json(tokenList)),
  http.get(
    "https://evmcrispr-api.fermyon.app/tokenlist/:chainId",
    () => HttpResponse.json(tokenList),
  ),
  http.get(
    "https://evmcrispr-api.fermyon.app/abi/:chainId/:address",
    ({ params }) => {
      const address = (params.address as string).toLowerCase();
      if (address === "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d") {
        return HttpResponse.json(wxdaiAbi);
      }
      return new HttpResponse(null, { status: 404 });
    },
  ),
];

// Create and start MSW server with shared + std handlers
export const server = createTestServer(...stdHandlers);
server.listen({ onUnhandledRequest: "bypass" });
