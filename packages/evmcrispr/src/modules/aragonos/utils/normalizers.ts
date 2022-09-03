import { utils } from 'ethers';

import { ErrorInvalid } from '../../../errors';

export const normalizeRole = (role: string): string => {
  if (role.startsWith('0x')) {
    if (role.length !== 66) {
      throw new ErrorInvalid('Invalid role provided', {
        name: 'ErrorInvalidRole',
      });
    }
    return role;
  }

  return utils.id(role);
};
