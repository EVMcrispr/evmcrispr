import type { Commands } from '../../../types';
import type { Giveth } from '../Safe';

import { multisend } from './multisend';

export const commands: Commands<Giveth> = {
  multisend,
};
