import type { IPFSResolver } from '@1hive/evmcrispr';

export const parseContentUri = (contentUri: string): string => {
  return contentUri.split(':').pop()!;
};

export const fetchAppArtifact = async (
  ipfsResolver: IPFSResolver,
  contentUri: string,
): Promise<any> => {
  return ipfsResolver.json(parseContentUri(contentUri), 'artifact.json');
};
