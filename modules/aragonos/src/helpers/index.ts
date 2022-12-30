import type { HelperFunctions } from '@1hive/evmcrispr';

import type { AragonOS } from '../AragonOS';
import { aragonEns } from './aragonEns';

export const helpers: HelperFunctions<AragonOS> = {
  aragonEns,
};
