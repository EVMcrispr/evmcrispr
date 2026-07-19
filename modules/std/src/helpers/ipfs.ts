import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type Std from "..";

const IPFS_VAR_NAME = "ipfsJwt";

export default defineHelper<Std>({
  name: "ipfs",
  description: "Upload text content to IPFS and return the CID.",
  returnType: "string",
  args: [
    {
      name: "text",
      type: "string",
      description: "Content to upload",
    },
  ],
  async run(module, { text }) {
    const jwt = module.getConfigBinding(IPFS_VAR_NAME);

    if (!jwt) {
      throw new ErrorException(
        `${module.buildConfigVar(
          IPFS_VAR_NAME,
        )} is not defined. Go to pinata.cloud and obtain your API key, please`,
      );
    }

    // pinFileToIPFS stores the text byte-exact (unlike pinJSONToIPFS, which
    // JSON-encodes the content), so @ipfs.get(@ipfs(text)) round-trips.
    const body = new FormData();
    body.append(
      "file",
      new Blob([String(text)], { type: "text/plain" }),
      "evmcrispr-file",
    );
    body.append("pinataOptions", JSON.stringify({ cidVersion: 0 }));
    body.append(
      "pinataMetadata",
      JSON.stringify({
        name: "evmcrispr-file",
        keyvalues: { type: "evmcrispr/text", version: "1" },
      }),
    );

    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
      body,
    });

    const { error, IpfsHash } = (await res.json()) as {
      IpfsHash: string;
      error?: string | { reason: string; details: string };
    };

    if (error || !res.ok) {
      const details =
        typeof error === "string" ? error : (error?.details ?? res.statusText);
      throw new ErrorException(
        `an error occurred while uploading data to IPFS: ${details}`,
      );
    }

    return IpfsHash;
  },
});
