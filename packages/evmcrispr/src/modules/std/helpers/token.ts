import { ethers } from 'ethers';
import fetch from 'isomorphic-fetch';

import { isAddress } from 'ethers/lib/utils';

import { ErrorException } from '../../../errors';

import type { Address, HelperFunction } from '../../../types';
import { BindingsSpace } from '../../../types';
import { ComparisonType, checkArgsLength, toDecimals } from '../../../utils';
import type { Module } from '../../../Module';
import type { Std } from '../Std';
import type { BigDecimalish } from '../../../BigDecimal';
import { isBigDecimalish } from '../../../BigDecimal';

const ENV_TOKENLIST = '$token.tokenlist';
const DEFAULT_TOKEN_LIST = 'https://tokens.uniswap.org/';

const getTokenList = ({ bindingsManager }: Module): string => {
  const tokenList = String(
    bindingsManager.getBindingValue(ENV_TOKENLIST, BindingsSpace.USER) ??
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

export const _token = async (
  module: Module,
  tokenSymbolOrAddress: string,
): Promise<Address> => {
  if (isAddress(tokenSymbolOrAddress)) {
    return tokenSymbolOrAddress;
  }
  const chainId = await module.getChainId();
  const tokenList = getTokenList(module);
  const {
    tokens,
  }: { tokens: { symbol: string; chainId: number; address: string }[] } =
    await fetch(tokenList).then((r) => r.json());
  const tokenAddress = tokens.find(
    (token) =>
      token.symbol === tokenSymbolOrAddress && token.chainId == chainId,
  )?.address;

  if (!tokenAddress) {
    throw new ErrorException(
      `${tokenSymbolOrAddress} not supported in ${tokenList} in chain ${chainId}.`,
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
  const [tokenSymbolOrAddress] = await interpretNodes(h.args);

  return _token(module, tokenSymbolOrAddress);
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
    await module.getProvider(),
  );

  return (await contract.balanceOf(holder)).toString();
};

export const _tokenAmount = async (
  module: Module,
  tokenSymbolOrAddress: string,
  amount: BigDecimalish,
): Promise<string> => {
  const tokenAddr = await _token(module, tokenSymbolOrAddress);

  const contract = new ethers.Contract(
    tokenAddr,
    ['function decimals() view returns (uint8)'],
    await module.getProvider(),
  );

  const decimals: number = await contract.decimals();
  return toDecimals(amount, decimals).toString();
};

export const tokenAmount: HelperFunction<Std> = async (
  module,
  h,
  { interpretNodes },
) => {
  checkArgsLength(h, {
    type: ComparisonType.Equal,
    minValue: 2,
  });
  const [tokenSymbolOrAddress, amount] = await interpretNodes(h.args);

  if (!isBigDecimalish(amount)) {
    throw new ErrorException('amount is not a number');
  }
  return _tokenAmount(module, tokenSymbolOrAddress, amount);
};
