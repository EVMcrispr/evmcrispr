/** Authenticated, normally deployed account fixtures. Never used by production execution. */

import type { TransactionAction } from "@evmcrispr/sdk";
import {
  COMPOSABLE_EXECUTOR_ADDRESS,
  ERC7579_BATCH_MODE,
  ERC7579_SINGLE_MODE,
  ERC7579_SMART_ABI,
} from "@evmcrispr/sdk/onchain";
import {
  type Abi,
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  type Hex,
  type PublicClient,
  parseAbi,
  toHex,
  type WalletClient,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import kernel from "./fixtures/kernel.json";
import nexus from "./fixtures/nexus.json";

// Anvil's publicly documented test key; isolated local chains only.
export const fixtureOwner = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const salt = toHex(1n, { size: 32 });
const moduleAbi = parseAbi(["function installModule(uint256,address,bytes)"]);
export function accountExecution(calls: TransactionAction[]): Hex {
  const mode = calls.length === 1 ? ERC7579_SINGLE_MODE : ERC7579_BATCH_MODE;
  const payload =
    calls.length === 1
      ? encodePacked(
          ["address", "uint256", "bytes"],
          [calls[0].to!, calls[0].value ?? 0n, calls[0].data ?? "0x"],
        )
      : encodeAbiParameters(
          [
            {
              type: "tuple[]",
              components: [
                { name: "target", type: "address" },
                { name: "value", type: "uint256" },
                { name: "callData", type: "bytes" },
              ],
            },
          ],
          [
            calls.map((call) => ({
              target: call.to!,
              value: call.value ?? 0n,
              callData: call.data ?? "0x",
            })),
          ],
        );
  return encodeFunctionData({
    abi: ERC7579_SMART_ABI,
    functionName: "execute",
    args: [mode, payload],
  });
}
export async function deploySmartAccount(
  client: PublicClient,
  wallet: WalletClient,
  kind: "nexus" | "kernel",
  installed = true,
) {
  const deploy = async (
    artifact: { abi: unknown; bytecode: string },
    args: unknown[] = [],
  ) => {
    const hash = await wallet.deployContract({
      account: fixtureOwner,
      chain: null,
      abi: artifact.abi as Abi,
      bytecode: artifact.bytecode as Hex,
      args,
      gas: 15_000_000n,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success" || !receipt.contractAddress)
      throw new Error("fixture deployment reverted");
    return receipt.contractAddress;
  };
  const write = async (
    address: Address,
    abi: unknown,
    functionName: string,
    args: unknown[],
  ) => {
    const hash = await wallet.writeContract({
      account: fixtureOwner,
      chain: null,
      address,
      abi: abi as Abi,
      functionName,
      args,
      gas: 15_000_000n,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success")
      throw new Error(`fixture ${functionName} reverted`);
    return hash;
  };
  const entryPoint = await deploy(nexus.contracts.EntryPoint);
  let address: Address;
  let validator: Address;
  if (kind === "kernel") {
    validator = await deploy(kernel.contracts.ECDSAValidator);
    const implementation = await deploy(kernel.contracts.Kernel, [entryPoint]);
    const factory = await deploy(kernel.contracts.KernelFactory, [
      implementation,
    ]);
    const initData = encodeFunctionData({
      abi: kernel.contracts.Kernel.abi as Abi,
      functionName: "initialize",
      args: [
        encodePacked(["bytes1", "address"], ["0x01", validator]),
        zeroAddress,
        fixtureOwner.address,
        "0x",
        [],
      ],
    });
    address = (await client.readContract({
      address: factory,
      abi: kernel.contracts.KernelFactory.abi as Abi,
      functionName: "getAddress",
      args: [initData, salt],
    })) as Address;
    await write(factory, kernel.contracts.KernelFactory.abi, "createAccount", [
      initData,
      salt,
    ]);
    if (installed) {
      const init = encodePacked(
        ["address", "bytes"],
        [
          zeroAddress,
          encodeAbiParameters(
            [{ type: "bytes" }, { type: "bytes" }],
            ["0x", "0x"],
          ),
        ],
      );
      await write(address, moduleAbi, "installModule", [
        2n,
        COMPOSABLE_EXECUTOR_ADDRESS,
        init,
      ]);
    }
  } else {
    validator = await deploy(nexus.contracts.K1Validator);
    const implementation = await deploy(nexus.contracts.Nexus, [
      entryPoint,
      validator,
      fixtureOwner.address,
    ]);
    const bootstrap = await deploy(nexus.contracts.NexusBootstrap, [
      validator,
      fixtureOwner.address,
    ]);
    const factory = await deploy(nexus.contracts.NexusAccountFactory, [
      implementation,
      fixtureOwner.address,
    ]);
    const bootstrapData = encodeFunctionData({
      abi: nexus.contracts.NexusBootstrap.abi as Abi,
      functionName: "initNexusWithDefaultValidatorAndOtherModulesNoRegistry",
      args: [
        fixtureOwner.address,
        [],
        installed ? [{ module: COMPOSABLE_EXECUTOR_ADDRESS, data: "0x" }] : [],
        { module: zeroAddress, data: "0x" },
        [],
        [],
      ],
    });
    const initData = encodeAbiParameters(
      [{ type: "address" }, { type: "bytes" }],
      [bootstrap, bootstrapData],
    );
    address = (await client.readContract({
      address: factory,
      abi: nexus.contracts.NexusAccountFactory.abi as Abi,
      functionName: "computeAccountAddress",
      args: [initData, salt],
    })) as Address;
    await write(
      factory,
      nexus.contracts.NexusAccountFactory.abi,
      "createAccount",
      [initData, salt],
    );
  }
  await client.waitForTransactionReceipt({
    hash: await wallet.sendTransaction({
      account: fixtureOwner,
      chain: null,
      to: address,
      value: 10n ** 18n,
    }),
  });
  const submit = async (calls: TransactionAction[], validSignature = true) => {
    const callData = accountExecution(calls);
    if (kind === "kernel") {
      return wallet.sendTransaction({
        account: fixtureOwner,
        chain: null,
        to: address,
        data: callData,
        gas: 15_000_000n,
      });
    }
    const abi = nexus.contracts.EntryPoint.abi as Abi;
    const nonce = (await client.readContract({
      address: entryPoint,
      abi,
      functionName: "getNonce",
      args: [address, 0n],
    })) as bigint;
    const op = {
      sender: address,
      nonce,
      initCode: "0x" as Hex,
      callData,
      accountGasLimits: encodePacked(
        ["uint128", "uint128"],
        [2_000_000n, 10_000_000n],
      ),
      preVerificationGas: 100_000n,
      gasFees: encodePacked(
        ["uint128", "uint128"],
        [1_000_000_000n, 2_000_000_000n],
      ),
      paymasterAndData: "0x" as Hex,
      signature: "0x" as Hex,
    };
    const hash = (await client.readContract({
      address: entryPoint,
      abi,
      functionName: "getUserOpHash",
      args: [op],
    })) as Hex;
    op.signature = await fixtureOwner.signMessage({
      message: { raw: validSignature ? hash : salt },
    });
    return wallet.writeContract({
      account: fixtureOwner,
      chain: null,
      address: entryPoint,
      abi,
      functionName: "handleOps",
      args: [[op], fixtureOwner.address],
      gas: 15_000_000n,
    });
  };
  const owner = async () =>
    kind === "nexus"
      ? client.readContract({
          address: validator,
          abi: nexus.contracts.K1Validator.abi as Abi,
          functionName: "getOwner",
          args: [address],
        })
      : client.readContract({
          address: validator,
          abi: kernel.contracts.ECDSAValidator.abi as Abi,
          functionName: "ecdsaValidatorStorage",
          args: [address],
        });
  return { address, entryPoint, validator, submit, owner };
}
