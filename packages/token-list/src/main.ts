import { getNetworkName } from "./coingecko";

type RequestObject = {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD";
  headers?: {
    [key: string]: string;
  } | null;
  path: string;
  query?: {
    [key: string]: string | string[];
  } | null;
  body?: string | null;
};

type ResponseObject =
  | {
      status: number;
      headers?: {
        [key: string]: string;
      } | null;
      body?: string;
    }
  | string
  | ArrayBuffer;

export async function main(params: RequestObject): Promise<ResponseObject> {
  try {
    const { chainId } = processParams(params);
    const { name: networkName, id: networkId } = await getNetworkName(chainId);
    const coingeckoTokenList = `https://tokens.coingecko.com/${networkId}/all.json`;
    const superfluidTokenList =
      "https://raw.githubusercontent.com/superfluid-finance/tokenlist/main/superfluid.extended.tokenlist.json";
    const tokenLists = await Promise.all([
      fetch(coingeckoTokenList).then((res) => res.json()),
      fetch(superfluidTokenList).then((res) => res.json()),
    ]);
    const lastTimestamp = Math.max(
      ...tokenLists.map((tokenList) => new Date(tokenList.timestamp).getTime()),
    );
    const tokenList = {
      name: `EVMcrispr Token List (${networkName})`,
      logoURI: "https://evmcrispr.com/favicon.ico",
      timestamp: new Date(lastTimestamp).toISOString(),
      tokens: tokenLists[0].tokens
        .concat(
          tokenLists[1].tokens.filter((token) => token.chainId === chainId),
        )
        .reduce((acc, token) => {
          if (acc.find((t) => t.address === token.address)) {
            return acc;
          }
          acc.push(token);
          return acc;
        }, []),
      version: {
        patch: 1,
      },
    };
    return {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(tokenList),
    };
  } catch (error) {
    if (isErrorWithStatusAndBody(error)) {
      return error;
    }
    return {
      status: 500,
      body: "Internal Server Error",
    };
  }
}

// main({ method: "GET", path: "/v0/1" }).then((res) => {
//   console.log(res);
// });

function isErrorWithStatusAndBody(
  error: unknown,
): error is { status: number; body: string } {
  const err = error as { [key: string]: unknown };
  return (
    err &&
    typeof err === "object" &&
    typeof err.status === "number" &&
    typeof err.body === "string"
  );
}

function processParams(params: RequestObject): { chainId: number } {
  const { method, path } = params;

  if (method !== "GET") {
    throw {
      status: 405,
      body: "Method Not Allowed",
    };
  }

  if (!path.startsWith("/v0/")) {
    throw {
      status: 400,
      body: "Invalid URL",
    };
  }
  const [, , chainId] = path.split("/");

  if (!Number(chainId)) {
    throw {
      status: 400,
      body: "Invalid chainId",
    };
  }

  return { chainId: Number(chainId) };
}
