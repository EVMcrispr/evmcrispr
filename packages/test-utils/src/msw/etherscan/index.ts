import type { DefaultBodyType, PathParams } from "msw";
import { HttpResponse, http } from "msw";
import { isAddress } from "viem";
import getabiRes from "./0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735.json";
import etherscanImpl from "./etherscan-impl.json";
import etherscanProxy from "./etherscan-proxy.json";
import etherscanVerified from "./etherscan-verified.json";

export const etherscan = {
  "0xc7ad46e0b8a400bb3c915120d284aafba8fc4735": getabiRes,
};

/**
 * Map of lowercased addresses to verified-source fixtures used by the
 * Etherscan V2 `getsourcecode` endpoint.
 *
 * The keys are the addresses our hover unit tests probe for; everything
 * else falls through to a `status: "1"` "Contract source code not
 * verified" envelope, which Etherscan returns for unverified contracts.
 */
export const etherscanVerifiedFixtures: Record<string, unknown> = {
  "0x0000000000000000000000000000000000001234": etherscanVerified,
  "0x0000000000000000000000000000000000005678": etherscanProxy,
  "0xbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef": etherscanImpl,
};

/** Standard Etherscan envelope for an unverified address. */
const ETHERSCAN_UNVERIFIED = {
  status: "1",
  message: "OK",
  result: [
    {
      SourceCode: "",
      ABI: "Contract source code not verified",
      ContractName: "",
      CompilerVersion: "",
      OptimizationUsed: "",
      Runs: "",
      ConstructorArguments: "",
      EVMVersion: "Default",
      Library: "",
      LicenseType: "Unknown",
      Proxy: "0",
      Implementation: "",
      SwarmSource: "",
    },
  ],
};

/** Generic Etherscan envelope shape. */
interface EtherscanEnvelope {
  status: string;
  message: string;
  result: string;
}

/**
 * Test-controllable state for the Etherscan V2 verification endpoints
 * (`verifysourcecode` POST and `checkverifystatus` GET).
 *
 * Tests reset this in `beforeEach` and then either:
 *  - read `lastSubmit` to assert on the form body the command POSTed, and/or
 *  - override `submitResponse` / `statusQueue` to simulate the
 *    submission and polling responses.
 *
 * `statusQueue` lets tests simulate a `Pending in queue` → `Pass - Verified`
 * sequence; once empty, `statusResponse` is returned for every poll.
 */
export const etherscanVerifyState: {
  lastSubmit: URLSearchParams | undefined;
  submitResponse: EtherscanEnvelope;
  statusResponse: EtherscanEnvelope;
  statusQueue: EtherscanEnvelope[];
  reset(): void;
} = {
  lastSubmit: undefined,
  submitResponse: { status: "1", message: "OK", result: "guid-default" },
  statusResponse: { status: "1", message: "OK", result: "Pass - Verified" },
  statusQueue: [],
  reset() {
    this.lastSubmit = undefined;
    this.submitResponse = {
      status: "1",
      message: "OK",
      result: "guid-default",
    };
    this.statusResponse = {
      status: "1",
      message: "OK",
      result: "Pass - Verified",
    };
    this.statusQueue = [];
  },
};

export const etherscanHandlers = [
  /**
   * Legacy Etherscan v1 ABI endpoint kept around for older suites that
   * stub `module=contract&action=getabi` on Rinkeby. The verified-contract
   * hover now uses the V2 unified endpoint below.
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
   * Etherscan V2 unified GET endpoint.
   *
   * Routes by `action`:
   *  - `getsourcecode` — returns a fixture from `etherscanVerifiedFixtures`,
   *    or the unverified envelope for any unmapped address.
   *  - `checkverifystatus` — returns from `etherscanVerifyState.statusQueue`
   *    if non-empty, otherwise `etherscanVerifyState.statusResponse`.
   *
   * The hover code authenticates with `VITE_ETHERSCAN_API_KEY`; here we
   * simply ignore the key.
   */
  http.get(`https://api.etherscan.io/v2/api`, ({ request }) => {
    const url = new URL(request.url);
    const module_ = url.searchParams.get("module");
    const action = url.searchParams.get("action");

    if (module_ === "contract" && action === "getsourcecode") {
      const address = url.searchParams.get("address");
      if (!address) {
        return HttpResponse.json({
          status: "0",
          message: "NOTOK",
          result: "Unsupported request",
        });
      }
      const fixture = etherscanVerifiedFixtures[address.toLowerCase()];
      if (!fixture) return HttpResponse.json(ETHERSCAN_UNVERIFIED);
      return HttpResponse.json(fixture);
    }

    if (module_ === "contract" && action === "checkverifystatus") {
      const next =
        etherscanVerifyState.statusQueue.shift() ??
        etherscanVerifyState.statusResponse;
      return HttpResponse.json(next);
    }

    return HttpResponse.json({
      status: "0",
      message: "NOTOK",
      result: "Unsupported request",
    });
  }),

  /**
   * Etherscan V2 `verifysourcecode` POST endpoint.
   *
   * Stashes the submitted form body in `etherscanVerifyState.lastSubmit`
   * so tests can assert on it, and returns
   * `etherscanVerifyState.submitResponse` (default: status 1, GUID
   * `guid-default`).
   */
  http.post(`https://api.etherscan.io/v2/api`, async ({ request }) => {
    const text = await request.text();
    const params = new URLSearchParams(text);
    const action = params.get("action");
    if (action !== "verifysourcecode") {
      return HttpResponse.json({
        status: "0",
        message: "NOTOK",
        result: `Unsupported action: ${action ?? "<none>"}`,
      });
    }
    etherscanVerifyState.lastSubmit = params;
    return HttpResponse.json(etherscanVerifyState.submitResponse);
  }),
];
