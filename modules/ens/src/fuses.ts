import { ErrorException } from "@evmcrispr/sdk";

/**
 * NameWrapper fuse bits, verified against
 * https://github.com/ensdomains/ens-contracts/blob/staging/contracts/wrapper/INameWrapper.sol
 */
export const OWNER_FUSES: Record<string, number> = {
  "cannot-unwrap": 1,
  "cannot-burn-fuses": 2,
  "cannot-transfer": 4,
  "cannot-set-resolver": 8,
  "cannot-set-ttl": 16,
  "cannot-create-subdomain": 32,
  "cannot-approve": 64,
};

export const PARENT_FUSES: Record<string, number> = {
  "parent-cannot-control": 1 << 16,
  "can-extend-expiry": 1 << 18,
};

export const FUSES: Record<string, number> = {
  ...OWNER_FUSES,
  ...PARENT_FUSES,
};

// Set by the NameWrapper itself on .eth 2LDs; not user-settable.
export const IS_DOT_ETH = 1 << 17;

export const CANNOT_UNWRAP = OWNER_FUSES["cannot-unwrap"];
export const PARENT_CANNOT_CONTROL = PARENT_FUSES["parent-cannot-control"];

const OWNER_FUSES_MASK = 0xffff;

export function fuseNames(): string[] {
  return Object.keys(FUSES);
}

/** Accept kebab-case (`cannot-unwrap`) or canonical SCREAMING_SNAKE (`CANNOT_UNWRAP`). */
function toKebab(name: string): string {
  return name.toLowerCase().replaceAll("_", "-");
}

export function parseFuse(name: string): number {
  const kebab = toKebab(name);
  if (kebab === "is-dot-eth") {
    throw new ErrorException(
      "is-dot-eth is set by the NameWrapper itself and cannot be burned manually",
    );
  }
  const bit = FUSES[kebab];
  if (bit === undefined) {
    throw new ErrorException(
      `unknown fuse "${name}"; valid fuses: ${fuseNames().join(", ")}`,
    );
  }
  return bit;
}

export function encodeFuses(names: string[]): number {
  return names.reduce((acc, name) => acc | parseFuse(name), 0);
}

export function decodeFuses(fuses: number): string[] {
  const names: string[] = [];
  let known = 0;
  for (const [name, bit] of Object.entries(FUSES)) {
    if (fuses & bit) {
      names.push(name);
      known |= bit;
    }
  }
  if (fuses & IS_DOT_ETH) {
    names.push("is-dot-eth");
    known |= IS_DOT_ETH;
  }
  const unknown = fuses & ~known;
  if (unknown) {
    names.push(`0x${unknown.toString(16)}`);
  }
  return names;
}

export function hasParentFuses(fuses: number): boolean {
  return (fuses & ~OWNER_FUSES_MASK) !== 0;
}

export function ownerFusesOf(fuses: number): number {
  return fuses & OWNER_FUSES_MASK;
}

/**
 * Validate that burning `newFuses` on a name whose current on-chain fuses are
 * `currentFuses` satisfies the NameWrapper prerequisites. Never auto-burns:
 * errors tell the user exactly which fuse to add.
 *
 * @param isChild whether the fuses are being set by the parent
 *   (`setChildFuses` / `setSubnodeRecord`), which additionally requires
 *   `parent-cannot-control`.
 */
export function validateFusePrereqs(
  newFuses: number,
  currentFuses: number,
  { isChild = false }: { isChild?: boolean } = {},
): void {
  const combined = newFuses | currentFuses;
  const burnsOwnerFuses = ownerFusesOf(newFuses) !== 0;

  if (ownerFusesOf(combined) & ~CANNOT_UNWRAP && !(combined & CANNOT_UNWRAP)) {
    const missing = decodeFuses(ownerFusesOf(newFuses) & ~CANNOT_UNWRAP);
    throw new ErrorException(
      `burning ${missing.join(", ")} requires cannot-unwrap — add it to the fuse list`,
    );
  }

  if (isChild && burnsOwnerFuses && !(combined & PARENT_CANNOT_CONTROL)) {
    throw new ErrorException(
      "burning owner-controlled fuses on a subname requires parent-cannot-control — add it to the fuse list",
    );
  }
}
