import { ethers } from 'ethers';

import type { EVMcrispr } from '..';

const ENV_TOKENLIST = '$token.tokenlist';
const DEFAULT_TOKENLIST = 'https://tokens.uniswap.org/';

async function token(evm: EVMcrispr, tokenSymbol: string): Promise<string> {
  const chainId = await evm.signer.getChainId();
  const tokenlist = _tokenlist(evm);
  const {
    tokens,
  }: { tokens: { symbol: string; chainId: number; address: string }[] } =
    await fetch(tokenlist).then((r) => r.json());
  const tokenAddress = tokens.find(
    (token) => token.symbol === tokenSymbol && token.chainId == chainId,
  )?.address;
  if (!tokenAddress) {
    throw new Error(
      `${tokenSymbol} not supported in ${tokenlist} in chain ${chainId}.`,
    );
  }
  return tokenAddress;
}

function _tokenlist(evm: EVMcrispr) {
  const tokenlist = String(evm.env(ENV_TOKENLIST) ?? DEFAULT_TOKENLIST);
  // Always check user data inputs:
  if (!tokenlist.startsWith('https://')) {
    throw new Error(`Tokenlist must be an HTTPS URL: ${tokenlist}`);
  }
  return tokenlist;
}

export async function tokenBalance(
  evm: EVMcrispr,
  tokenSymbol: string,
  account: string,
): Promise<string> {
  const tokenAddr = await token(evm, tokenSymbol);
  const contract = new ethers.Contract(
    tokenAddr,
    ['function balanceOf(address owner) view returns (uint)'],
    evm.signer,
  );
  return (await contract.balanceOf(account)).toString();
}

export default token;
