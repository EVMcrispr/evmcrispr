import type { Module, TransactionAction } from "@evmcrispr/sdk";
import { ErrorException, encodeAction } from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import { bytesToHex, parseAbi, zeroAddress } from "viem";
import { requireAddress, verifiableFactoryMap } from "./addresses";

/**
 * ENSv2's VerifiableFactory (verified on Sourcify): deploys a UUPS proxy of an
 * implementation at a CREATE2 address salted with `keccak256(abi.encode(
 * deployer, salt))`, so the address is known before the deployment.
 */
export const verifiableFactoryAbi = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address)",
  "function predictProxyAddress(address deployer, uint256 salt) view returns (address)",
]);

/** Every role and its admin, as ensjs grants whoever deploys a resolver or a
 *  registry: roles sit 4 bits apart, and each admin 128 bits above its role. */
export const ALL_ROLES = BigInt(
  "0x1111111111111111111111111111111111111111111111111111111111111111",
);

/** The deployment of `implementation`, initialized with `init`, by `deployer`
 *  through the VerifiableFactory: its predicted address and the action. The
 *  salt is random unless given; an address already taken stops it. */
export async function factoryDeployment(
  module: Module,
  chainId: number,
  implementation: Address,
  init: Hex,
  deployer: Address,
  salt?: Hex,
): Promise<{ address: Address; action: TransactionAction }> {
  const factory = requireAddress(
    verifiableFactoryMap,
    chainId,
    "VerifiableFactory",
  );
  const value = BigInt(
    salt ?? bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
  );
  const client = await module.getClient();
  const address = await client.readContract({
    address: factory,
    abi: verifiableFactoryAbi,
    functionName: "predictProxyAddress",
    args: [deployer, value],
  });
  if (address === zeroAddress) {
    throw new ErrorException("the VerifiableFactory predicted no address");
  }
  const code = await client.getCode({ address });
  if (code && code !== "0x") {
    throw new ErrorException(
      `a contract already exists at ${address} for this sender and salt; choose another --salt`,
    );
  }
  return {
    address,
    action: encodeAction(factory, "deployProxy(address,uint256,bytes)", [
      implementation,
      value,
      init,
    ]),
  };
}
