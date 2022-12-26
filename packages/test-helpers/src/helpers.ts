export function addressesEqual(first: string, second: string): boolean {
  first = first && first.toLowerCase();
  second = second && second.toLowerCase();
  return first === second;
}
