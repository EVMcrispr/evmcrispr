import { ErrorInvalid } from '@1hive/evmcrispr';
import { utils } from 'ethers';

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
