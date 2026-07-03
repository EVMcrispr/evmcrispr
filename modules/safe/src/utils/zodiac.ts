import type { Address, TransactionAction } from "@evmcrispr/sdk";
import { ErrorNotFound } from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import {
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  getContractAddress,
  keccak256,
  parseAbiParameters,
  toHex,
} from "viem";
import { MODULE_PROXY_FACTORY } from "../addresses";

/** First mastercopy candidate deployed on the current chain (candidates
 *  are ordered newest non-faulty version first). */
export const pickDeployedMastercopy = async (
  client: PublicClient,
  candidates: Address[],
  label: string,
): Promise<Address> => {
  for (const candidate of candidates) {
    const code = await client.getCode({ address: candidate });
    if (code && code !== "0x") return candidate;
  }
  throw new ErrorNotFound(
    `no ${label} mastercopy is deployed on this chain (tried ${candidates.join(", ")})`,
  );
};

/** Encode the `setUp(bytes initParams)` initializer call Zodiac
 *  mastercopies expect from the ModuleProxyFactory. */
export const encodeSetUp = (
  paramTypes: string,
  values: unknown[],
): `0x${string}` =>
  encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "setUp",
        stateMutability: "nonpayable",
        inputs: [{ name: "initParams", type: "bytes" }],
        outputs: [],
      },
    ],
    functionName: "setUp",
    args: [encodeAbiParameters(parseAbiParameters(paramTypes), values as any)],
  });

/**
 * Predict the address of a Zodiac minimal proxy deployed through
 * `ModuleProxyFactory.deployModule(masterCopy, initializer, saltNonce)`:
 * CREATE2 over the EIP-1167 bytecode with
 * salt = keccak256(keccak256(initializer) ++ saltNonce).
 */
export const predictZodiacModuleAddress = (
  masterCopy: Address,
  initializer: `0x${string}`,
  saltNonce: bigint,
): Address => {
  const bytecode = concatHex([
    "0x602d8060093d393df3363d3d373d3d3d363d73",
    masterCopy,
    "0x5af43d82803e903d91602b57fd5bf3",
  ]);
  const salt = keccak256(
    concatHex([keccak256(initializer), toHex(saltNonce, { size: 32 })]),
  );
  return getAddress(
    getContractAddress({
      opcode: "CREATE2",
      from: MODULE_PROXY_FACTORY,
      salt,
      bytecode,
    }),
  );
};

export const encodeDeployModule = (
  masterCopy: Address,
  initializer: `0x${string}`,
  saltNonce: bigint,
): TransactionAction => ({
  to: MODULE_PROXY_FACTORY,
  data: encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "deployModule",
        stateMutability: "nonpayable",
        inputs: [
          { name: "masterCopy", type: "address" },
          { name: "initializer", type: "bytes" },
          { name: "saltNonce", type: "uint256" },
        ],
        outputs: [{ name: "proxy", type: "address" }],
      },
    ],
    functionName: "deployModule",
    args: [masterCopy, initializer, saltNonce],
  }),
});
