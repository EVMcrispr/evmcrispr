import { encryptScript } from "@evmcrispr/core";

const PINATA_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

export async function createLink(args: {
  script: string;
  title: string;
  baseUrl?: string;
}): Promise<{
  success: boolean;
  url?: string;
  cid?: string;
  key?: string;
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

  const baseUrl = (args.baseUrl ?? "https://next.evmcrispr.com").replace(
    /\/$/,
    "",
  );

  try {
    // End-to-end encrypted: the pinned JSON is an AES-256-GCM envelope and the
    // key only lives in the link's URL fragment (never sent to any server).
    const { envelope, key } = await encryptScript({
      title: args.title,
      script: args.script,
    });

    const res = await fetch(PINATA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        pinataOptions: { cidVersion: 0 },
        pinataMetadata: {
          name: "EVMcrispr - encrypted script",
          keyvalues: {
            type: "evmcripsr/json",
            version: "0.11",
          },
        },
        pinataContent: envelope,
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
    const url = `${baseUrl}/#/${IpfsHash}#${key}`;

    return { success: true, url, cid: IpfsHash, key };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
