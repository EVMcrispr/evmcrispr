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

export const safeFactoryAbi = parseAbi([
  "function createProxyWithNonce(address _singleton, bytes initializer, uint256 saltNonce) returns (address proxy)",
  "function proxyCreationCode() pure returns (bytes)",
]);

export function safeInitializer(
  owners: Address[],
  threshold: bigint,
  handler: Address,
): Hex {
  return encodeFunctionData({
    abi: parseAbi([
      "function setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)",
    ]),
    functionName: "setup",
    args: [
      owners,
      threshold,
      zeroAddress,
      "0x",
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
): Address {
  return getContractAddress({
    opcode: "CREATE2",
    from: deployment.proxyFactory,
    salt: keccak256(
      concatHex([keccak256(initializer), toHex(saltNonce, { size: 32 })]),
    ),
    bytecode: concatHex([
      creationCode,
      toHex(BigInt(deployment.l2Singleton), { size: 32 }),
    ]),
  });
}

export function encodeSafeDeployment(
  deployment: SafeDeployment,
  initializer: Hex,
  saltNonce: bigint,
): TransactionAction {
  return {
    to: deployment.proxyFactory,
    data: encodeFunctionData({
      abi: safeFactoryAbi,
      functionName: "createProxyWithNonce",
      args: [deployment.l2Singleton, initializer, saltNonce],
    }),
  };
}
