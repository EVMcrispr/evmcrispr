import type { Entity, Permission } from '@1hive/evmcrispr-aragonos-module';

import { and, oracle, timestamp } from '@1hive/evmcrispr-aragonos-module';

export const GRANT_PERMISSIONS: Permission[] = [
  ['0xc125218F4Df091eE40624784caF7F47B9738086f', 'token-manager', 'MINT_ROLE'],
  ['0xc125218F4Df091eE40624784caF7F47B9738086f', 'token-manager', 'BURN_ROLE'],
];

export const GRANT_PERMISSION_PARAMS: Permission = [
  '0xc125218F4Df091eE40624784caF7F47B9738086f',
  'token-manager',
  'MINT_ROLE',
];

export const GRANT_PERMISSION_PARAMS_PARAMS = and(
  oracle('0x0'),
  timestamp.gte(10000000),
);

export const NEW_PERMISSIONS: Permission[] = [
  ['voting', 'token-manager', 'ISSUE_ROLE'],
  ['voting', 'token-manager', 'REVOKE_VESTINGS_ROLE'],
];

export const NEW_PERMISSION_PARAMS: Permission = [
  'voting',
  'token-manager',
  'ISSUE_ROLE',
];

export const NEW_PERMISSION_PARAMS_PARAMS = and(
  oracle('0x0'),
  timestamp.gte(10000000),
);

export const REVOKE_PERMISSIONS: Permission[] = [
  ['voting', 'finance', 'CREATE_PAYMENTS_ROLE'],
  ['voting', 'voting', 'MODIFY_SUPPORT_ROLE'],
];

export const PERMISSION_MANAGER: Entity = 'voting';
