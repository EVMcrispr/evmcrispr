import { IpfsResolver } from "@1hive/connect-core";

export const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

const parseContentUri = (contentUri: string): string => {
  return contentUri.split(":").pop()!;
};

export const getAppArtifact = async (ipfsResolver: IpfsResolver, contentUri: string): Promise<any> => {
  return ipfsResolver.json(parseContentUri(contentUri), "artifact.json");
};

export const buildIpfsTemplate = (ipfsGateway: string): string => {
  let ipfsUrlTemplate = ipfsGateway;

  if (ipfsGateway.charAt(ipfsGateway.length - 1) !== "/") {
    ipfsUrlTemplate += "/";
  }

  return (ipfsUrlTemplate += "{cid}{path}");
};
