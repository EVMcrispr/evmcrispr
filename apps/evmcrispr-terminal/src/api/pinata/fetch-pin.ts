import { IPFSResolver } from "@evmcrispr/core";

const resolver = new IPFSResolver();

/** Fetch a pin's content from the gateway, hash-verified against its CID. */
const fetchPin = async (
  pinataUrl: string,
  hashId?: string,
): Promise<string | undefined> => {
  if (!hashId) return undefined;

  return resolver.text(hashId, `${pinataUrl}/ipfs/`);
};

export default fetchPin;
