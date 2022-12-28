import type { Address } from '@1hive/evmcrispr';

export class AddressSet extends Set<Address> {
  constructor(iterable?: Iterable<Address> | null | undefined) {
    super([...(iterable ?? [])].map((v) => v.toLowerCase()));
  }

  has(value: Address): boolean {
    return super.has(value.toLowerCase());
  }

  add(value: Address): this {
    return super.add(value.toLowerCase());
  }

  delete(value: string): boolean {
    return super.delete(value.toLowerCase());
  }
}
