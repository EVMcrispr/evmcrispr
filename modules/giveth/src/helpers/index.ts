import type { HelperFunctions } from '@1hive/evmcrispr';

import type { Giveth } from '../Giveth';
import { projectAddr } from './projectAddr';

export const helpers: HelperFunctions<Giveth> = {
  projectAddr,
};
