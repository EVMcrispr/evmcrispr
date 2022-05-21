import { utils } from 'ethers';

import { ErrorInvalid } from '../errors';
import type { ActionFunction } from '../types';

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

export const normalizeActions = (actions: ActionFunction[]): ActionFunction => {
  return async () => {
    return (await Promise.all(actions.map((action) => action()))).flat();
  };
};
