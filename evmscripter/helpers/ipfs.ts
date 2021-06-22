import { Organization } from "@1hive/connect";

const parseContentUri = (contentUri: string): string => {
  return contentUri.split(":").pop();
};

export const getAppArtifact = async (dao: Organization, contentUri: string): Promise<any> => {
  return (await dao.connection.ipfs.json(parseContentUri(contentUri), "artifact.json")) as any;
};
