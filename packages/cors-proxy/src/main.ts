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
    const { url } = processParams(params);

    const response = await fetch(url, {
      method: params.method,
      headers: params.headers ?? {},
      body: JSON.stringify(params.body),
    });
    const body = await response.text();
    const headers = Object.fromEntries((response.headers as any).entries());
    headers["Access-Control-Allow-Origin"] = "*";
    const status = response.status;

    return {
      status,
      headers,
      body,
    };
  } catch (error) {
    if (isErrorWithStatusAndBody(error)) {
      return error;
    }
    return {
      status: 500,
      body: "Internal Server Error: " + error.message + error.stack,
    };
  }
}

// const slug = "evmcrispr";
// main({
//   method: "POST",
//   path: "/v0/https://mainnet.serve.giveth.io/graphql",
//   headers: {
//     "Content-Type": "application/json",
//   },
//   body: JSON.stringify({
//     query: `
//       query GetLearnWithJasonEpisodes($slug: String!) {
//         projectBySlug(slug: $slug) {
//           id
//           addresses {
//             address
//             networkId
//           }
//         }
//       }
//       `,
//     variables: {
//       slug,
//     },
//   }),
// }).then((res) => {
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

function processParams(params: RequestObject): { url: string } {
  const { path } = params;
  if (!path.startsWith("/v0/")) {
    throw {
      status: 400,
      body: "Invalid URL",
    };
  }
  const url = path.replace("/v0/", "");
  return { url };
}
