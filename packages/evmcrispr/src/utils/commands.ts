import type { BindingsManager } from '../BindingsManager';
import type { BindingsSpace } from '../types';

export const tryAndCacheNotFound = async <R>(
  fetchResourceFn: () => R,
  resourceName: string,
  bindingSpace: BindingsSpace,
  cache: BindingsManager,
): Promise<R | void> => {
  if (cache.getBindingValue(resourceName, bindingSpace) === null) {
    return;
  }

  try {
    const result = await fetchResourceFn();
    return result;
  } catch (err) {
    if (!cache.hasBinding(resourceName, bindingSpace)) {
      cache.setBinding(resourceName, null, bindingSpace);
    }
    return;
  }
};
