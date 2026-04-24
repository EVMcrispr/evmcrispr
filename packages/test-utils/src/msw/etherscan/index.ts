import type { DefaultBodyType, PathParams } from "msw";
import { HttpResponse, http } from "msw";
import { isAddress } from "viem";
import getabiRes from "./0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735.json";
import sourcifyImpl from "./sourcify-impl.json";
import sourcifyProxy from "./sourcify-proxy.json";
import sourcifyVerified from "./sourcify-verified.json";

export const etherscan = {
  "0xc7ad46e0b8a400bb3c915120d284aafba8fc4735": getabiRes,
};

/**
 * Map of lowercased addresses to verified-source fixtures used by the
 * Sourcify `/server/files/any/{chainId}/{address}` endpoint.
 *
 * The keys are the addresses our hover unit tests probe for; everything
 * else falls through to a `404 Files have not been found!` response, which
 * Sourcify uses for unverified contracts.
 */
export const sourcifyFiles: Record<string, unknown> = {
  "0x0000000000000000000000000000000000001234": sourcifyVerified,
  "0x0000000000000000000000000000000000005678": sourcifyProxy,
  "0xbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef": sourcifyImpl,
};

export const etherscanHandlers = [
  /**
   * Legacy Etherscan v1 ABI endpoint kept around for older suites that
   * stub `module=contract&action=getabi` on Rinkeby. The verified-contract
   * hover no longer touches Etherscan at all.
   */
  http.get<
    PathParams<string>,
    DefaultBodyType,
    { status: string; message: string; result: string }
  >(`https://api-rinkeby.etherscan.io/api`, ({ request }) => {
    const address = new URL(request.url).searchParams.get("address");
    if (!address || !isAddress(address)) {
      return HttpResponse.json({
        status: "0",
        message: "NOTOK",
        result: "Invalid Address format",
      });
    }

    const data = etherscan[address.toLowerCase() as keyof typeof etherscan];

    if (!data) {
      return HttpResponse.json({
        status: "0",
        message: "NOTOK",
        result: "Contract source code not verified",
      });
    }

    return HttpResponse.json(data);
  }),

  /**
   * Sourcify's public files endpoint — returns 404 when the contract is
   * not verified (or not in our fixture map).
   */
  http.get(
    `https://sourcify.dev/server/files/any/:chainId/:address`,
    ({ params }) => {
      const address = String(params.address ?? "");
      if (!isAddress(address)) {
        return HttpResponse.json({ error: "Invalid address" }, { status: 400 });
      }
      const data = sourcifyFiles[address.toLowerCase()];
      if (!data) {
        return HttpResponse.json(
          {
            error: "Files have not been found!",
            message: "Files have not been found!",
          },
          { status: 404 },
        );
      }
      return HttpResponse.json(data);
    },
  ),
];
