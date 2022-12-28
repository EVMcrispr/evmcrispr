import type { Address } from '@1hive/evmcrispr';

export class AddressMap<T> extends Map<Address, T> {
  constructor() {
    super();
  }

  get(key: string): T | undefined {
    return super.get(key.toLowerCase());
  }
  has(key: string): boolean {
    return super.has(key.toLowerCase());
  }
  set(key: string, value: T): this {
    return super.set(key.toLowerCase(), value);
  }
}
