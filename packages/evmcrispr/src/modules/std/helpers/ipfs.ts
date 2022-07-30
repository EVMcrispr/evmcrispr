import fetch from 'isomorphic-fetch';

import type { EVMcrispr } from '../../..';

async function ipfs(evm: EVMcrispr, text: string): Promise<string> {
  if (!evm.env('$ipfs.jwt')) {
    throw new Error(
      '$ipfs.jwt is not definied. Go to pinata.cloud and obtain your API key, please.',
    );
  }

  const jwt = evm.env('$ipfs.jwt');

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

  const response = (await res.json()) as { IpfsHash: string };
  return response.IpfsHash;
}

export default ipfs;
