import { primeIpfsContent, SINGLE_BLOCK_LIMIT } from "@evmcrispr/core";
import { pin, type Res } from "./pin";

/**
 * Pin raw text to IPFS byte-exact (unlike `pinJSON`, which stores the
 * content JSON-encoded).
 */
const pinText = async (text: string): Promise<Res> => {
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

  const res = await pin(body);
  // A fresh pin can take a while to reach public gateways — remember the
  // uploaded bytes so this session resolves the CID instantly. Only for a
  // CID `pin` could check against them: a larger file's is the service's
  // word, and is resolved like anyone else's, verified, from a gateway.
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= SINGLE_BLOCK_LIMIT) {
    primeIpfsContent(res.IpfsHash, bytes);
  }
  return res;
};

export default pinText;
