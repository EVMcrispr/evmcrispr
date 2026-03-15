const PINATA_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

export async function createLink(args: {
  script: string;
  title: string;
  baseUrl?: string;
}): Promise<{
  success: boolean;
  url?: string;
  cid?: string;
  error?: string;
}> {
  const jwt = process.env.VITE_PINATA_JWT;
  if (!jwt) {
    return {
      success: false,
      error:
        "VITE_PINATA_JWT environment variable is not set. Get an API key from pinata.cloud.",
    };
  }

  const baseUrl = (args.baseUrl ?? "https://localhost:3000").replace(/\/$/, "");

  try {
    const res = await fetch(PINATA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        pinataOptions: { cidVersion: 0 },
        pinataMetadata: {
          name: `EVMcrispr - ${args.title}`,
          keyvalues: {
            type: "evmcripsr/json",
            version: "0.9",
          },
        },
        pinataContent: {
          title: args.title,
          script: args.script,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        success: false,
        error: `Pinata API error (${res.status}): ${text}`,
      };
    }

    const { IpfsHash } = (await res.json()) as { IpfsHash: string };
    const url = `${baseUrl}/#/${IpfsHash}`;

    return { success: true, url, cid: IpfsHash };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
