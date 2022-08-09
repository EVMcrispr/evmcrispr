import type { HelperFunctions } from '../../../types';
import type { Std } from '../Std';
import { date } from './date';
import { id } from './id';
import { me } from './me';
import { token, tokenBalance } from './token';

export const helpers: HelperFunctions<Std> = {
  date,
  id,
  me,
  token,
  ['token.balance']: tokenBalance,
};
