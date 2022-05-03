import type { Entity, Permission, PermissionP } from '../../src';
import { and, oracle, timestamp } from '../../src';

export const GRANT_PERMISSIONS: Permission[] = [
  ['0xc125218F4Df091eE40624784caF7F47B9738086f', 'token-manager', 'MINT_ROLE'],
  ['0xc125218F4Df091eE40624784caF7F47B9738086f', 'token-manager', 'BURN_ROLE'],
];

export const GRANT_PERMISSION_PARAMS: PermissionP = [
  '0xc125218F4Df091eE40624784caF7F47B9738086f',
  'token-manager',
  'MINT_ROLE',
  and(oracle('0x0'), timestamp.gte(10000000)),
];

export const NEW_PERMISSIONS: Permission[] = [
  ['voting', 'token-manager', 'ISSUE_ROLE'],
  ['voting', 'token-manager', 'REVOKE_VESTINGS_ROLE'],
];

export const NEW_PERMISSION_PARAMS: PermissionP = [
  'voting',
  'token-manager',
  'ISSUE_ROLE',
  and(oracle('0x0'), timestamp.gte(10000000)),
];

export const REVOKE_PERMISSIONS: Permission[] = [
  ['voting', 'finance', 'CREATE_PAYMENTS_ROLE'],
  ['voting', 'voting', 'MODIFY_SUPPORT_ROLE'],
];

export const PERMISSION_MANAGER: Entity = 'voting';
