import { ethers } from 'ethers';
import fetch from 'isomorphic-fetch';

import { ErrorException, ErrorInvalid } from '../../../../errors';
import type { RawHelperFunction } from '../../../types';
import {
  CallableExpression,
  ComparisonType,
  checkArgsLength,
} from '../../../utils';
import type { Module } from '../../Module';
import type { Std } from '../Std';

const ENV_TOKENLIST = 'token.tokenlist';
export const DEFAULT_TOKEN_LIST = 'https://tokens.uniswap.org/';

const getTokenList = ({ bindingsManager }: Module): string => {
  const tokenList = String(
    bindingsManager.getBinding(ENV_TOKENLIST) ?? DEFAULT_TOKEN_LIST,
  );

  // Always check user data inputs:
  if (!tokenList.startsWith('https://')) {
    throw new ErrorInvalid(`Tokenlist must be an HTTPS URL: ${tokenList}`);
  }
  return tokenList;
};

export const token: RawHelperFunction<Std> = async (module, ...args) => {
  checkArgsLength('token', CallableExpression.Helper, args.length, {
    type: ComparisonType.Equal,
    minValue: 1,
  });

  const [tokenSymbol] = args;
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

export const tokenBalance: RawHelperFunction<Std> = async (module, ...args) => {
  checkArgsLength('token.balance', CallableExpression.Helper, args.length, {
    type: ComparisonType.Equal,
    minValue: 2,
  });

  const [tokenSymbol, holder] = args;
  const tokenAddr = await token(module, tokenSymbol);
  const contract = new ethers.Contract(
    tokenAddr,
    ['function balanceOf(address owner) view returns (uint)'],
    module.signer,
  );

  return (await contract.balanceOf(holder)).toString();
};
