import { primeIpfsContent, SINGLE_BLOCK_LIMIT } from "@evmcrispr/core";
import { pin, type Res } from "./pin";

/**
 * Pin a file to IPFS byte-exact, preserving its mimetype and (for `File`
 * instances) its filename.
 */
const pinFile = async (file: File | Blob, name?: string): Promise<Res> => {
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

  const res = await pin(body);
  // A fresh pin can take a while to reach public gateways — remember the
  // uploaded bytes so this session resolves the CID instantly. Only for a
  // CID `pin` could check against them: a larger file's is the service's
  // word, and is resolved like anyone else's, verified, from a gateway.
  if (file.size <= SINGLE_BLOCK_LIMIT && !fileName.includes("/")) {
    primeIpfsContent(res.IpfsHash, new Uint8Array(await file.arrayBuffer()));
  }
  return res;
};

export default pinFile;
