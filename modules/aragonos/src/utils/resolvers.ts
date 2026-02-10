import type { Address } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import { namehash, parseAbi, zeroAddress } from "viem";

export function getAragonEnsResolver(chainId: number): Address | never {
  switch (chainId) {
    case 1:
      return "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
    case 4:
      return "0x98Df287B6C145399Aaa709692c8D308357bC085D";
    case 5:
      return "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
    case 10:
      return "0x6f2CA655f58d5fb94A08460aC19A552EB19909FD";
    case 100:
      return "0xaafca6b0c89521752e559650206d7c925fd0e530";
    default:
      throw new ErrorException(
        `No Aragon ENS resolver found for chain id ${chainId}`,
      );
  }
}

export async function resolveName(
  name: string,
  ensResolver: Address,
  client: PublicClient,
): Promise<Address | null> {
  if (!/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+eth/.test(name)) {
    throw new ErrorException(`ENS not valid: ${name}`);
  }
  const _namehash = namehash(name);

  const resolver = await client.readContract({
    address: ensResolver,
    abi: parseAbi([
      "function resolver(bytes32 node) external view returns (address)",
    ]),
    functionName: "resolver",
    args: [_namehash],
  });
  if (resolver === zeroAddress) return null;
  const daoAddress = await client.readContract({
    address: resolver,
    abi: parseAbi([
      "function addr(bytes32 node) external view returns (address ret)",
    ]),
    functionName: "addr",
    args: [_namehash],
  });
  return daoAddress === zeroAddress ? null : daoAddress;
}
