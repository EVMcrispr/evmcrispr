import type { Address } from "../types";

export class AddressSet extends Set<Address> {
  constructor(iterable?: Iterable<Address> | null | undefined) {
    super([...(iterable ?? [])].map((v) => v.toLowerCase() as Address));
  }

  has(value: Address): boolean {
    return super.has(value.toLowerCase() as Address);
  }

  add(value: Address): this {
    return super.add(value.toLowerCase() as Address);
  }

  delete(value: string): boolean {
    return super.delete(value.toLowerCase() as Address);
  }
}

export class AddressMap<T> extends Map<Address, T> {
  get(key: string): T | undefined {
    return super.get(key.toLowerCase() as Address);
  }
  has(key: string): boolean {
    return super.has(key.toLowerCase() as Address);
  }
  set(key: string, value: T): this {
    return super.set(key.toLowerCase() as Address, value);
  }
}
