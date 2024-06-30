import type { Address } from "../../types";

export class AddressMap<T> extends Map<Address, T> {
  constructor() {
    super();
  }

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
