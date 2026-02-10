import type { Address } from "@evmcrispr/sdk";

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
