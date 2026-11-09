// Where the frame account contracts live: the same addresses on every chain,
// through the deterministic CREATE2 deployer. Computed from the committed
// artifacts, never written by hand, so they follow every recompile.
import {
  type Address,
  concatHex,
  encodeAbiParameters,
  getContractAddress,
  type Hex,
  numberToHex,
  pad,
} from "viem";
import {
  frameAccountBytecode,
  frameAccountFactoryBytecode,
} from "./contracts/artifacts";

/** Arachnid's deterministic deployment proxy: `salt ‖ initCode` → CREATE2. */
export const DETERMINISTIC_DEPLOYER: Address =
  "0x4e59b44847b379578588920cA78FbF26c0B4956C";

const DEPLOY_SALT: Hex = pad("0x00", { size: 32 });

const created = (bytecode: Hex): Address =>
  getContractAddress({
    opcode: "CREATE2",
    from: DETERMINISTIC_DEPLOYER,
    salt: DEPLOY_SALT,
    bytecode,
  });

/** The FrameAccount implementation every clone delegates to. */
export const IMPLEMENTATION_ADDRESS: Address = created(frameAccountBytecode);

const factoryInitCode: Hex = concatHex([
  frameAccountFactoryBytecode,
  encodeAbiParameters([{ type: "address" }], [IMPLEMENTATION_ADDRESS]),
]);

/** The FrameAccountFactory that makes accounts. */
export const FACTORY_ADDRESS: Address = created(factoryInitCode);

/** The two deployments, in order, each a call to the deterministic deployer. */
export function deploymentTransactions(): { to: Address; data: Hex }[] {
  return [frameAccountBytecode, factoryInitCode].map((initCode) => ({
    to: DETERMINISTIC_DEPLOYER,
    data: concatHex([DEPLOY_SALT, initCode]),
  }));
}

/**
 * The account an owner has, or will have, for a salt: the CREATE2 address of
 * OpenZeppelin's clone with immutable arguments
 * (`Clones.predictDeterministicAddressWithImmutableArgs`), the argument being
 * `abi.encode(owner)`.
 */
export function predictAccountAddress(owner: Address, salt: bigint): Address {
  const args = encodeAbiParameters([{ type: "address" }], [owner]);
  const argsLength = (args.length - 2) / 2;
  const cloneInitCode = concatHex([
    "0x61",
    numberToHex(0x2d + argsLength, { size: 2 }),
    "0x3d81600a3d39f3363d3d373d3d3d363d73",
    IMPLEMENTATION_ADDRESS,
    "0x5af43d82803e903d91602b57fd5bf3",
    args,
  ]);
  return getContractAddress({
    opcode: "CREATE2",
    from: FACTORY_ADDRESS,
    salt: numberToHex(salt, { size: 32 }),
    bytecode: cloneInitCode,
  });
}
