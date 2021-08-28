import { IpfsResolver } from "@1hive/connect-core";

export const IPFS_URI_TEMPLATE = "https://gateway.pinata.cloud/ipfs/{cid}{path}";

const parseContentUri = (contentUri: string): string => {
  return contentUri.split(":").pop()!;
};

export const getAppArtifact = async (ipfsResolver: IpfsResolver, contentUri: string): Promise<any> => {
  return ipfsResolver.json(parseContentUri(contentUri), "artifact.json");
};
