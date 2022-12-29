import fetch from 'isomorphic-fetch';

import { ErrorException } from '../../errors';
import type { HelperFunction } from '../../types';
import { ComparisonType, checkArgsLength } from '../../utils';
import type { Std } from '../Std';

const IPFS_VAR_NAME = 'ipfs.jwt';

export const ipfs: HelperFunction<Std> = async (
  module,
  h,
  { interpretNode },
) => {
  checkArgsLength(h, { type: ComparisonType.Equal, minValue: 1 });
  const jwt = module.getConfigBinding(IPFS_VAR_NAME);

  if (!jwt) {
    throw new ErrorException(
      `${module.buildConfigVar(
        IPFS_VAR_NAME,
      )} is not defined. Go to pinata.cloud and obtain your API key, please`,
    );
  }

  const text = await interpretNode(h.args[0], { treatAsLiteral: true });

  const data = JSON.stringify({
    pinataOptions: {
      cidVersion: 0,
    },
    pinataMetadata: {
      name: 'evmcrispr-file',
    },
    pinataContent: text,
  });

  const config = {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: data,
  };

  const res = await fetch(
    'https://api.pinata.cloud/pinning/pinJSONToIPFS',
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
};
