import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type Std from "..";

const IPFS_VAR_NAME = "ipfs.jwt";

export default defineHelper<Std>({
  name: "ipfs",
  args: [
    {
      name: "text",
      type: "string",
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

    const data = JSON.stringify({
      pinataOptions: {
        cidVersion: 0,
      },
      pinataMetadata: {
        name: "evmcrispr-file",
      },
      pinataContent: text,
    });

    const config = {
      method: "post",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: data,
    };

    const res = await fetch(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      config,
    );

    const { error, IpfsHash } = (await res.json()) as {
      IpfsHash: string;
      error?: { reason: string; details: string };
    };

    if (error) {
      throw new ErrorException(
        `an error occurred while uploading data to IPFS: ${error.details}`,
      );
    }

    return IpfsHash;
  },
});
