import type { Address, Param } from "@evmcrispr/sdk";
import type { AbiParameter, PublicClient } from "viem";
import { createPublicClient, getAddress } from "viem";
import { mainnet } from "viem/chains";

/**
 * Render a bigint as an EVML number literal, compacting only to the eth
 * (e18) and gwei (e9) scales: `1e18`, `1.5e18`, `2e9`. A scale is used
 * when the value is at least 10^k and its mantissa needs at most 6
 * decimal places; anything else stays plain decimal.
 */
export function formatCompactNumber(value: bigint): string {
  if (value < 0n) return `-${formatCompactNumber(-value)}`;

  for (const exponent of [18, 9]) {
    const base = 10n ** BigInt(exponent);
    if (value < base) continue;
    // Mantissa must terminate within 6 decimals: divisible by 10^(k-6)
    if (value % 10n ** BigInt(exponent - 6) !== 0n) continue;
    const integer = value / base;
    const fraction = ((value % base) * 10n ** 6n) / base;
    const decimals = fraction.toString().padStart(6, "0").replace(/0+$/, "");
    return decimals
      ? `${integer}.${decimals}e${exponent}`
      : `${integer}e${exponent}`;
  }

  return value.toString();
}

export type EnsResolver = (address: Address) => Promise<string | null>;

/**
 * Reverse-resolver for primary ENS names on mainnet. Never throws: any
 * failure (chain without ENS routing, network error) resolves to null so
 * callers fall back to the checksummed address.
 */
export function makeEnsResolver(module: {
  getTransport(chainId: number): any;
}): EnsResolver {
  let client: PublicClient | undefined;
  const cache = new Map<Address, string | null>();

  return async (address: Address) => {
    const checksummed = getAddress(address);
    const cached = cache.get(checksummed);
    if (cached !== undefined) return cached;
    let name: string | null;
    try {
      client ??= createPublicClient({
        chain: mainnet,
        transport: module.getTransport(mainnet.id),
      });
      name = await client.getEnsName({ address: checksummed });
    } catch {
      name = null;
    }
    cache.set(checksummed, name);
    return name;
  };
}

/**
 * Render a decoded ABI value as a human-readable EVML value: addresses
 * become `@ens(name)` when a primary name exists, numbers compact to
 * e18/e9 notation, arrays and tuples recurse into nested arrays.
 */
export async function renderAbiValue(
  param: AbiParameter,
  value: unknown,
  resolveEns: EnsResolver,
): Promise<Param> {
  const arrayMatch = param.type.match(/^(.*)\[\d*\]$/);
  if (arrayMatch) {
    const elements = Array.isArray(value) ? value : [];
    return Promise.all(
      elements.map((element) =>
        renderAbiValue({ ...param, type: arrayMatch[1] }, element, resolveEns),
      ),
    );
  }

  if (param.type === "tuple") {
    const components =
      "components" in param ? (param.components as AbiParameter[]) : [];
    return Promise.all(
      components.map((component, i) => {
        const field = Array.isArray(value)
          ? value[i]
          : (value as Record<string, unknown>)?.[component.name ?? i];
        return renderAbiValue(component, field, resolveEns);
      }),
    );
  }

  if (param.type === "address") {
    const address = getAddress(value as string);
    const name = await resolveEns(address);
    return name ? `@ens(${name})` : address;
  }

  if (param.type.startsWith("uint") || param.type.startsWith("int")) {
    return formatCompactNumber(value as bigint);
  }

  if (param.type === "bool") {
    return value ? "true" : "false";
  }

  if (param.type === "string") {
    return `"${value}"`;
  }

  // bytes/bytesN and anything else: hex or plain string form as-is
  return String(value);
}
