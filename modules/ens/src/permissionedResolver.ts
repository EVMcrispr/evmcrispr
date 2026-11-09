import type { Hex } from "viem";
import { parseAbi, toHex } from "viem";
import { normalize, packetToBytes } from "viem/ens";

/**
 * ENSv2's PermissionedResolver as deployed (verified on Sourcify; it differs
 * from contracts-v2's main branch). Each setter takes the DNS-encoded name,
 * not its node, and creates the name's record on first use; reads go through
 * `resolve(name, data)` (ENSIP-10), which the Universal Resolver does.
 * Writing needs the setter's role on the resolver, granted when it is
 * initialized.
 */
export const permissionedResolverAbi = parseAbi([
  "struct Grant { address account; uint256 roleBitmap; }",
  "function initialize(Grant[] grants, bytes[] calls)",
]);

/** The setters, by the signature `encodeAction` takes. */
export const SET_TEXT = "setText(bytes,string,string)";
export const SET_ADDRESS = "setAddress(bytes,uint256,bytes)";
export const SET_CONTENTHASH = "setContenthash(bytes,bytes)";

/** Every role and its admin, as ensjs grants the deployer of a resolver:
 *  roles sit 4 bits apart, and each admin 128 bits above its role. */
export const ALL_ROLES = BigInt(
  "0x1111111111111111111111111111111111111111111111111111111111111111",
);

export const verifiableFactoryAbi = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address)",
  "function predictProxyAddress(address deployer, uint256 salt) view returns (address)",
]);

/** The DNS wire form of a name, as the setters take it. */
export const dnsName = (name: string): Hex =>
  toHex(packetToBytes(normalize(name)));

/** SLIP-44 coin type of ETH (ENSIP-9). */
export const COIN_TYPE_ETH = 60n;
