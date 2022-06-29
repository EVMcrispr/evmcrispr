import type { Address, EVMcrispr, Permission } from '../../..';
import { ErrorInvalid } from '../../../errors';
import { normalizeRole } from '../../../utils';

export function resolvePermission(
  evm: EVMcrispr,
  permission: Permission,
): [Address, Address, string] {
  if (!permission[0]) {
    throw new ErrorInvalid(`Permission not well formed, grantee missing`, {
      name: 'ErrorInvalidIdentifier',
    });
  }
  if (!permission[1]) {
    throw new ErrorInvalid(`Permission not well formed, app missing`, {
      name: 'ErrorInvalidIdentifier',
    });
  }
  if (!permission[2]) {
    throw new ErrorInvalid(`Permission not well formed, role missing`, {
      name: 'ErrorInvalidIdentifier',
    });
  }
  return permission.map((entity, index) =>
    index < permission.length - 1
      ? evm.resolver.resolveEntity(entity)
      : normalizeRole(entity),
  ) as [Address, Address, string];
}
