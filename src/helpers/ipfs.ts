import { IpfsResolver } from "@1hive/connect-core";

// export const IPFS_URI_TEMPLATE = "https://ipfs.eth.aragon.network/ipfs/{cid}{path}";
export const IPFS_URI_TEMPLATE = "https://ipfs.io/ipfs/{cid}{path}";

const parseContentUri = (contentUri: string): string => {
  return contentUri.split(":").pop();
};

export const getAppArtifact = async (ipfsResolver: IpfsResolver, contentUri: string): Promise<any> => {
  return ipfsResolver.json(parseContentUri(contentUri), "artifact.json");
};
