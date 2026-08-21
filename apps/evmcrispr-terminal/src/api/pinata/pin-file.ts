import { primeIpfsContent } from "@evmcrispr/core";

type Res = {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
};

/**
 * Pin a file to IPFS byte-exact, preserving its mimetype and (for `File`
 * instances) its filename.
 */
const pinFile = async (file: File | Blob, name?: string): Promise<Res> => {
  const PINATA_JWT = import.meta.env.VITE_PINATA_JWT;
  const url = "https://api.pinata.cloud/pinning/pinFileToIPFS";

  const fileName =
    name ?? (file instanceof File ? file.name : "evmcrispr-file");

  const body = new FormData();
  body.append("file", file, fileName);
  body.append("pinataOptions", JSON.stringify({ cidVersion: 0 }));
  body.append(
    "pinataMetadata",
    JSON.stringify({
      name: "EVMcrispr - uploaded file",
      keyvalues: {
        type: "evmcrispr/file",
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
    primeIpfsContent(res.IpfsHash, new Uint8Array(await file.arrayBuffer()));
    return res;
  } catch (_e) {
    throw new Error("Bad response from server");
  }
};

export default pinFile;
