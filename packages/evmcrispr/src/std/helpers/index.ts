import type { HelperFunctions } from '../../types';
import type { Std } from '../Std';
import { date } from './date';
import { get } from './get';
import { id } from './id';
import { ipfs } from './ipfs';
import { me } from './me';
import { token, tokenAmount, tokenBalance } from './token';

export const helpers: HelperFunctions<Std> = {
  date,
  get,
  id,
  ipfs,
  me,
  token,
  ['token.balance']: tokenBalance,
  ['token.amount']: tokenAmount,
};
