import { Organization } from "@1hive/connect";

export const IPFS_URI_TEMPLATE = "https://ipfs.eth.aragon.network/ipfs/{cid}{path}";

const parseContentUri = (contentUri: string): string => {
  return contentUri.split(":").pop();
};

export const getAppArtifact = async (dao: Organization, contentUri: string): Promise<any> => {
  return (await dao.connection.ipfs.json(parseContentUri(contentUri), "artifact.json")) as any;
};
