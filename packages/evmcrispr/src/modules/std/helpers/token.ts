import { ethers } from 'ethers';
import fetch from 'isomorphic-fetch';

import { ErrorException } from '../../..';

import { BindingsSpace } from '../../../BindingsManager';
import type { Address, HelperFunction } from '../../../types';
import { ComparisonType, checkArgsLength } from '../../../utils';
import type { Module } from '../../Module';
import type { Std } from '../Std';

const ENV_TOKENLIST = '$token.tokenlist';
const DEFAULT_TOKEN_LIST = 'https://tokens.uniswap.org/';

const getTokenList = ({ bindingsManager }: Module): string => {
  const tokenList = String(
    bindingsManager.getBinding(ENV_TOKENLIST, BindingsSpace.USER) ??
      DEFAULT_TOKEN_LIST,
  );

  // Always check user data inputs:
  if (!tokenList.startsWith('https://')) {
    throw new ErrorException(
      `${ENV_TOKENLIST} must be a valid HTTPS URL, got ${tokenList}`,
    );
  }
  return tokenList;
};

const _token = async (
  module: Module,
  tokenSymbol: string,
): Promise<Address> => {
  const chainId = await module.signer.getChainId();
  const tokenList = getTokenList(module);
  const {
    tokens,
  }: { tokens: { symbol: string; chainId: number; address: string }[] } =
    await fetch(tokenList).then((r) => r.json());
  const tokenAddress = tokens.find(
    (token) => token.symbol === tokenSymbol && token.chainId == chainId,
  )?.address;

  if (!tokenAddress) {
    throw new ErrorException(
      `${tokenSymbol} not supported in ${tokenList} in chain ${chainId}.`,
    );
  }

  return tokenAddress;
};

export const token: HelperFunction<Std> = async (
  module,
  h,
  { interpretNodes },
) => {
  checkArgsLength(h, {
    type: ComparisonType.Equal,
    minValue: 1,
  });
  const [tokenSymbol] = await interpretNodes(h.args);

  return _token(module, tokenSymbol);
};

export const tokenBalance: HelperFunction<Std> = async (
  module,
  h,
  { interpretNodes },
) => {
  checkArgsLength(h, {
    type: ComparisonType.Equal,
    minValue: 2,
  });

  const [tokenSymbol, holder] = await interpretNodes(h.args);

  const tokenAddr = await _token(module, tokenSymbol);
  const contract = new ethers.Contract(
    tokenAddr,
    ['function balanceOf(address owner) view returns (uint)'],
    module.signer,
  );

  return (await contract.balanceOf(holder)).toString();
};
