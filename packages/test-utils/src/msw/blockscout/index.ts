import { HttpResponse, http } from "msw";
import { isAddress } from "viem";
import { etherscanVerifiedFixtures } from "../etherscan";
import res from "./0x44fA8E6f47987339850636F88629646662444217.json";
import res1 from "./0xf8D1677c8a0c961938bf2f9aDc3F3CFDA759A9d9.json";

export const blockscout = {
  "0x44fa8e6f47987339850636f88629646662444217": res,
  "0xf8d1677c8a0c961938bf2f9adc3f3cfda759a9d9": res1,
};

export const blockscoutHandlers = [
  http.get<
    { address: string },
    { address: string },
    { status: string; message: string; result: string }
  >(`https://blockscout.com/xdai/mainnet/api`, ({ request }) => {
    const address = new URL(request.url).searchParams.get("address");

    if (!address || !isAddress(address)) {
      return HttpResponse.json({
        status: "0",
        message: "NOTOK",
        result: "Invalid Address format",
      });
    }

    const data = blockscout[address.toLowerCase() as keyof typeof blockscout];

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
   * Mainnet Blockscout instance, consulted by the sdk's keyless
   * verification fallback. Serves the same fixture map as the Etherscan
   * V2 mock so keyless flows resolve the same contracts deterministically;
   * unmapped addresses get Blockscout's real unverified shape (a bare
   * `Address` entry, no `ContractName`).
   */
  http.get(`https://eth.blockscout.com/api`, ({ request }) => {
    const url = new URL(request.url);
    if (
      url.searchParams.get("module") !== "contract" ||
      url.searchParams.get("action") !== "getsourcecode"
    ) {
      return HttpResponse.json({
        status: "0",
        message: "NOTOK",
        result: "Unsupported request",
      });
    }
    const address = url.searchParams.get("address")?.toLowerCase();
    const fixture = address ? etherscanVerifiedFixtures[address] : undefined;
    if (fixture) return HttpResponse.json(fixture);
    return HttpResponse.json({
      status: "1",
      message: "OK",
      result: [{ Address: address ?? "" }],
    });
  }),
];
