import type { TransactionAction } from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import {
  concatHex,
  encodeFunctionData,
  getContractAddress,
  keccak256,
  parseAbi,
  toHex,
  zeroAddress,
} from "viem";
import type { SafeDeployment } from "../addresses";

// SafeProxy creation bytecode from @safe-global/safe-smart-account 1.5.0,
// the code the v1.5.0 factory deploys (`proxyCreationCode()`). Shared by
// safe:new and @safe:address so prediction needs no RPC.
export const SAFE_PROXY_CREATION_CODE: Hex =
  "0x608060405234801561001057600080fd5b506040516101b63803806101b68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156100ca576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806101946022913960400191505060405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555050607b806101196000396000f3fe608060405260005463a619486e60003560e01c14156024578060601b606c5260206060f35b3660008037600080366000845af43d6000803e806040573d6000fd5b3d6000f3fea2646970667358221220e61834ebd2d8cd909d362bf67c47ef58fd665df38e6dd036ce65611101d072e964736f6c63430007060033496e76616c69642073696e676c65746f6e20616464726573732070726f7669646564";

export const safeFactoryAbi = parseAbi([
  "function createProxyWithNonce(address _singleton, bytes initializer, uint256 saltNonce) returns (address proxy)",
  "function proxyCreationCode() pure returns (bytes)",
]);

/** The delegatecall `setup()` makes right after initializing the owners. */
export interface SafeSetupCall {
  to: Address;
  data: Hex;
}

export function safeInitializer(
  owners: Address[],
  threshold: bigint,
  handler: Address,
  setupCall: SafeSetupCall = { to: zeroAddress, data: "0x" },
): Hex {
  return encodeFunctionData({
    abi: parseAbi([
      "function setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)",
    ]),
    functionName: "setup",
    args: [
      owners,
      threshold,
      setupCall.to,
      setupCall.data,
      handler,
      zeroAddress,
      0n,
      zeroAddress,
    ],
  });
}

export function predictSafeAddress(
  deployment: SafeDeployment,
  creationCode: Hex,
  initializer: Hex,
  saltNonce: bigint,
  singleton: Address = deployment.l2Singleton,
): Address {
  return getContractAddress({
    opcode: "CREATE2",
    from: deployment.proxyFactory,
    salt: keccak256(
      concatHex([keccak256(initializer), toHex(saltNonce, { size: 32 })]),
    ),
    bytecode: concatHex([creationCode, toHex(BigInt(singleton), { size: 32 })]),
  });
}

export function encodeSafeDeployment(
  deployment: SafeDeployment,
  initializer: Hex,
  saltNonce: bigint,
  singleton: Address = deployment.l2Singleton,
): TransactionAction {
  return {
    to: deployment.proxyFactory,
    data: encodeFunctionData({
      abi: safeFactoryAbi,
      functionName: "createProxyWithNonce",
      args: [singleton, initializer, saltNonce],
    }),
  };
}

/**
 * A new Safe the way Safe{Wallet} creates one: the plain singleton, plus a
 * SafeToL2Setup delegatecall in `setup()` that switches it to the L2
 * singleton on every chain but Ethereum mainnet. The deployment inputs are
 * then the same on every chain, so the same owners, threshold and salt give
 * the same address everywhere; the Safe web app only offers "Add network"
 * for Safes created this way. Used by safe:new and @safe:address.
 */
export function multichainSafe(
  deployment: SafeDeployment,
  owners: Address[],
  threshold: bigint,
): { singleton: Address; initializer: Hex } {
  return {
    singleton: deployment.singleton,
    initializer: safeInitializer(
      owners,
      threshold,
      deployment.fallbackHandler,
      {
        to: deployment.toL2Setup,
        data: encodeFunctionData({
          abi: parseAbi(["function setupToL2(address l2Singleton)"]),
          functionName: "setupToL2",
          args: [deployment.l2Singleton],
        }),
      },
    ),
  };
}
