import { primeIpfsContent } from "@evmcrispr/core";

type Res = {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
};

/**
 * Pin raw text to IPFS byte-exact (unlike `pinJSON`, which stores the
 * content JSON-encoded).
 */
const pinText = async (text: string): Promise<Res> => {
  const PINATA_JWT = import.meta.env.VITE_PINATA_JWT;
  const url = "https://api.pinata.cloud/pinning/pinFileToIPFS";

  const body = new FormData();
  body.append(
    "file",
    new Blob([text], { type: "text/plain" }),
    "evmcrispr-file",
  );
  body.append("pinataOptions", JSON.stringify({ cidVersion: 0 }));
  body.append(
    "pinataMetadata",
    JSON.stringify({
      name: "EVMcrispr - pasted hex",
      keyvalues: {
        type: "evmcrispr/text",
        version: "0.9",
      },
    }),
  );

  try {
    const response = await fetch(url, {
      method: "POST",
      body,
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
      },
    });

    if (response.status >= 400) {
      throw new Error("Bad response from server");
    }

    const res: Res = await response.json();
    // A fresh pin can take a while to reach public gateways — remember the
    // uploaded bytes so this session resolves the CID instantly.
    primeIpfsContent(res.IpfsHash, new TextEncoder().encode(text));
    return res;
  } catch (_e) {
    throw new Error("Bad response from server");
  }
};

export default pinText;
