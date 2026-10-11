import { IPFSResolver } from "@evmcrispr/core";

const resolver = new IPFSResolver();

/**
 * Fetch a shared script from the IPFS gateway: the plain file, checked
 * against its CID in the browser.
 */
const fetchPin = async (hashId?: string): Promise<string | undefined> => {
  if (!hashId) return undefined;

  return resolver.evml(hashId);
};

export default fetchPin;
