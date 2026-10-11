import { encryptScript, pinToIpfs } from "@evmcrispr/core";

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

    const cid = await pinToIpfs(
      {
        pinataOptions: { cidVersion: 0 },
        pinataMetadata: {
          name: "EVMcrispr - encrypted script",
          keyvalues: {
            type: "evmcripsr/json",
            version: "0.11",
          },
        },
        pinataContent: envelope,
      },
      {
        // With a Pinata token of your own the pin goes straight there;
        // without one, through the EVMcrispr API.
        jwt: process.env.VITE_PINATA_JWT,
        pinUrl: process.env.VITE_IPFS_PIN_URL,
        // One block, so whoever opens it can check the plain file.
        singleBlock: true,
      },
    );
    const url = `${baseUrl}/#/${cid}#${key}`;

    return { success: true, url, cid, key };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
