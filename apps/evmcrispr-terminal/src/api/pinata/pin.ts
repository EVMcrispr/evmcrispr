import { ErrorTooLargeToPin, pinToIpfs } from "@evmcrispr/core";
import { EVMCRISPR_API_BASE } from "../../config/api";

export type Res = {
  IpfsHash: string;
};

/**
 * Pin through the EVMcrispr API, which holds the Pinata token: none is
 * compiled into this app. `VITE_IPFS_PIN_URL` points a self-hosted build at
 * its own deployment of the route.
 */
export const pin = async (
  body: Parameters<typeof pinToIpfs>[0],
  { singleBlock }: { singleBlock?: boolean } = {},
): Promise<Res> => {
  try {
    const IpfsHash = await pinToIpfs(body, {
      pinUrl:
        import.meta.env.VITE_IPFS_PIN_URL ?? `${EVMCRISPR_API_BASE}/ipfs/pin`,
      singleBlock,
    });
    return { IpfsHash };
  } catch (e) {
    // The one failure the user can do something about.
    if (e instanceof ErrorTooLargeToPin) throw e;
    throw new Error("Bad response from server");
  }
};
