import { ErrorException } from "../../../errors";
import { defineHelper } from "../../../utils";
import type { Std } from "../Std";

const IPFS_VAR_NAME = "ipfs.jwt";

export const ipfs = defineHelper<Std>({
  args: [
    {
      name: "text",
      type: "string",
      interpretOptions: { treatAsLiteral: true },
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
