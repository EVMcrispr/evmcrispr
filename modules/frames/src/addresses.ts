// Where the frame account contracts live: the same addresses on every chain of
// a build (the tracer devnets', the Hegota devnet's), through the
// deterministic CREATE2 deployer. Computed from the committed
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
  frameAccountHegotaBytecode,
  frameSponsorBytecode,
  frameSponsorHegotaBytecode,
} from "./contracts/artifacts";
import { isHegotaBuild } from "./networks";

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

/** A network's frame account contracts: where they are, how they are
 *  deployed, and where an owner's account is. */
export interface AccountContracts {
  /** The FrameAccount implementation every clone delegates to. */
  implementation: Address;
  /** The FrameAccountFactory that makes accounts. */
  factory: Address;
  /** The two deployments, in order, each a call to the deterministic
   *  deployer. */
  deploymentTransactions(): { to: Address; data: Hex }[];
  /** The account an owner has, or will have, for a salt. */
  predictAccountAddress(owner: Address, salt: bigint): Address;
  /** FrameSponsor's creation code (constructor arguments appended). */
  sponsorBytecode: Hex;
}

function contractsOf(
  accountBytecode: Hex,
  sponsorBytecode: Hex,
): AccountContracts {
  const implementation = created(accountBytecode);
  const factoryInitCode: Hex = concatHex([
    frameAccountFactoryBytecode,
    encodeAbiParameters([{ type: "address" }], [implementation]),
  ]);
  const factory = created(factoryInitCode);
  return {
    implementation,
    factory,
    deploymentTransactions: () =>
      [accountBytecode, factoryInitCode].map((initCode) => ({
        to: DETERMINISTIC_DEPLOYER,
        data: concatHex([DEPLOY_SALT, initCode]),
      })),
    /**
     * The CREATE2 address of OpenZeppelin's clone with immutable arguments
     * (`Clones.predictDeterministicAddressWithImmutableArgs`), the argument
     * being `abi.encode(owner)`.
     */
    predictAccountAddress(owner, salt) {
      const args = encodeAbiParameters([{ type: "address" }], [owner]);
      const argsLength = (args.length - 2) / 2;
      const cloneInitCode = concatHex([
        "0x61",
        numberToHex(0x2d + argsLength, { size: 2 }),
        "0x3d81600a3d39f3363d3d373d3d3d363d73",
        implementation,
        "0x5af43d82803e903d91602b57fd5bf3",
        args,
      ]);
      return getContractAddress({
        opcode: "CREATE2",
        from: factory,
        salt: numberToHex(salt, { size: 32 }),
        bytecode: cloneInitCode,
      });
    },
    sponsorBytecode,
  };
}

/** The tracer devnets' build (hegota-support's ERC8421_WORKSHOP). */
const TRACER = contractsOf(frameAccountBytecode, frameSponsorBytecode);
/** The Hegota devnet's build (EIP7906_WORKSHOP, SIGDATACOPY at 0xba). */
const HEGOTA = contractsOf(
  frameAccountHegotaBytecode,
  frameSponsorHegotaBytecode,
);

/** The frame account contracts of `chainId`'s network. */
export function accountContracts(chainId: number): AccountContracts {
  return isHegotaBuild(chainId) ? HEGOTA : TRACER;
}

/** The tracer devnets' implementation, factory and accounts. */
export const IMPLEMENTATION_ADDRESS: Address = TRACER.implementation;
export const FACTORY_ADDRESS: Address = TRACER.factory;
export const deploymentTransactions = TRACER.deploymentTransactions;
export const predictAccountAddress = TRACER.predictAccountAddress;
