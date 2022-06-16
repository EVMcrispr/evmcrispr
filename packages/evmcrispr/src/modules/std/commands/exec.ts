import type { ActionFunction, Entity } from '../../..';
import type Std from '../Std';

export function exec(
  module: Std,
  target: Entity,
  signature: string,
  params: any[],
): ActionFunction {
  return async () => {
    return module.evm.encodeAction(target, signature, params)();
  };
}
