import { EVMcrispr } from '@1hive/evmcrispr';
import type { Signer } from 'ethers';

import { sponsors } from '../assets/sponsors.json';

type DAOData = {
  dao: string;
  path: string[];
  context: string;
  _code: string;
  evmcrispr: EVMcrispr;
};

async function dao(code: string, signer: Signer): Promise<DAOData> {
  const [, dao, _path, , , context] =
    code
      .split('\n')[0]
      .match(/^connect ([\w.-]+)(( [\w.\-:]+)*)( @context:(.+))?$/) ?? [];
  if (!dao || !_path) {
    console.log(dao, _path);
    throw new Error('First line must be `connect <dao> <...path>`');
  }
  const path = _path
    .trim()
    .split(' ')
    .map((id) => id.trim());
  const _code = code.split('\n').slice(1).join('\n');
  const evmcrispr = await EVMcrispr.create(dao, signer, {
    ipfsGateway: 'https://ipfs.blossom.software/ipfs/',
  });
  return { dao, path, context, _code, evmcrispr };
}

function client(chainId: number | undefined): string | undefined {
  switch (chainId) {
    case 4:
      return 'rinkeby.client.aragon.org';
    case 100:
      return 'aragon.1hive.org';
    default:
      return 'client.aragon.org';
  }
}

function parsedSponsors(): string {
  switch (sponsors.length) {
    case 1:
      return `sponsored by <a href="${sponsors[0][1]}">${sponsors[0][0]}</a>`;
    case 2:
      return `sponsored by <a href="${sponsors[0][1]}">${sponsors[0][0]}</a> and <a href="${sponsors[1][1]}">${sponsors[1][0]}</a>`;
    case 3:
      return `sponsored by <a href="${sponsors[0][1]}">${sponsors[0][0]}</a>, <a href="${sponsors[1][1]}">${sponsors[1][0]}</a>, and <a href="${sponsors[2][1]}">${sponsors[2][0]}</a>`;
    default:
      return '';
  }
}

export { dao, client, parsedSponsors };
