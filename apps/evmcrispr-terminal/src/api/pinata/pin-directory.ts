type Res = {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
};

/**
 * Pin a folder to IPFS as a single directory (one CID). Each part's
 * filename is its path relative to the drop root, including the folder
 * name itself — that's how Pinata reconstructs the directory tree.
 */
const pinDirectory = async (
  files: { file: File; path: string }[],
): Promise<Res> => {
  const PINATA_JWT = import.meta.env.VITE_PINATA_JWT;
  const url = "https://api.pinata.cloud/pinning/pinFileToIPFS";

  const body = new FormData();
  for (const { file, path } of files) {
    body.append("file", file, path);
  }
  body.append("pinataOptions", JSON.stringify({ cidVersion: 0 }));
  body.append(
    "pinataMetadata",
    JSON.stringify({
      name: "EVMcrispr - uploaded folder",
      keyvalues: {
        type: "evmcrispr/directory",
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

    return response.json();
  } catch (_e) {
    throw new Error("Bad response from server");
  }
};

export default pinDirectory;
