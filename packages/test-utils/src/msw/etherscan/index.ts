import type { DefaultBodyType, PathParams } from "msw";
import { HttpResponse, http } from "msw";
import { isAddress } from "viem";
import res from "./0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735.json";

export const etherscan = {
  "0xc7ad46e0b8a400bb3c915120d284aafba8fc4735": res,
};

export const etherscanHandlers = [
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
];
