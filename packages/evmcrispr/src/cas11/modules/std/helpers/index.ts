import type { RawHelperFunctions } from '../../../types';
import type { Std } from '../Std';
import { date } from './date';
import { id } from './id';
import { me } from './me';
import { token, tokenBalance } from './token';

export const helpers: RawHelperFunctions<Std> = {
  date,
  id,
  me,
  token,
  ['token.balance']: tokenBalance,
};
