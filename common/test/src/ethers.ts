import 'isomorphic-fetch';
import { Wallet, providers } from 'ethers';

import { buildChainEndpoint } from './chain-manager/helpers';

// eslint-disable-next-line turbo/no-undeclared-env-vars
const WORKER_ID = parseInt(process.env.VITEST_POOL_ID ?? '1');

const PRIVATE_KEYS = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
  '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e',
  '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356',
  '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97',
  '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6',
];

export async function getProvider(
  chainManagerPort: number,
): Promise<providers.JsonRpcProvider> {
  const chainManagerEndpoint = buildChainEndpoint(chainManagerPort);
  const response = await fetch(
    `${chainManagerEndpoint}/chain?index=${WORKER_ID}`,
  );
  const data = await response.json();

  if (response.status !== 200) {
    throw new Error(`Error when trying to get provider: ${data.message}`);
  }

  return new providers.JsonRpcProvider(data.endpoint);
}

export async function getWallets(chainManagerPort: number): Promise<Wallet[]> {
  const provider = await getProvider(chainManagerPort);

  return PRIVATE_KEYS.map((pk) => new Wallet(pk, provider));
}
