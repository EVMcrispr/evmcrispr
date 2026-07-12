import {
  defineCommand,
  ErrorException,
  encodeAction,
  Num,
} from "@evmcrispr/sdk";
import type { Address, PublicClient } from "viem";
import { hashDomain, maxUint256, parseAbi, parseSignature } from "viem";
import type Token from "..";

const PERMIT_ABI = parseAbi([
  "function nonces(address owner) view returns (uint256)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function name() view returns (string)",
  "function version() view returns (string)",
  "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)",
]);

const DOMAIN_TYPE = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
] as const;

const PERMIT_TYPE = [
  { name: "owner", type: "address" },
  { name: "spender", type: "address" },
  { name: "value", type: "uint256" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
] as const;

/** Reconstruct the token's EIP-712 domain: eip712Domain() (EIP-5267) when
 *  available, otherwise name() plus version(), defaulting version to "1". */
async function resolveDomain(
  client: PublicClient,
  token: Address,
  chainId: number,
) {
  try {
    const [, name, version, domainChainId, verifyingContract] =
      await client.readContract({
        address: token,
        abi: PERMIT_ABI,
        functionName: "eip712Domain",
      });
    return {
      name,
      version,
      chainId: Number(domainChainId),
      verifyingContract,
    };
  } catch {
    // pre-EIP-5267 token
  }

  let name: string;
  try {
    name = await client.readContract({
      address: token,
      abi: PERMIT_ABI,
      functionName: "name",
    });
  } catch {
    throw new ErrorException(
      "could not read the token name to build the EIP-712 domain",
    );
  }

  let version = "1";
  try {
    version = await client.readContract({
      address: token,
      abi: PERMIT_ABI,
      functionName: "version",
    });
  } catch {
    // tokens without version() almost always use "1"
  }

  return { name, version, chainId, verifyingContract: token };
}

export default defineCommand<Token>({
  name: "permit",
  description:
    "Approve a spender through an EIP-2612 permit signed by the connected wallet, encoded as a permit() call anyone can submit.",
  args: [
    { name: "token", type: "address", description: "Token address" },
    { name: "spender", type: "address", description: "Spender address" },
    {
      name: "amount",
      type: "number",
      description: "Allowance in token units (wei)",
    },
  ],
  opts: [
    {
      name: "deadline",
      type: "number",
      description: "Permit expiry as a Unix timestamp (defaults to no expiry)",
    },
  ],
  async run(module, { token, spender, amount }, { opts, interpreters }) {
    const { actionCallback } = interpreters;
    if (!actionCallback) {
      throw new ErrorException(
        "token:permit requires an execution context with wallet access",
      );
    }

    const owner = await module.getConnectedAccount(true);
    const client = await module.getClient();
    const chainId = await module.getChainId();

    let nonce: bigint;
    let separator: `0x${string}`;
    try {
      [nonce, separator] = await Promise.all([
        client.readContract({
          address: token,
          abi: PERMIT_ABI,
          functionName: "nonces",
          args: [owner],
        }),
        client.readContract({
          address: token,
          abi: PERMIT_ABI,
          functionName: "DOMAIN_SEPARATOR",
        }),
      ]);
    } catch {
      throw new ErrorException(
        "token does not support EIP-2612 permit (missing nonces(address) or DOMAIN_SEPARATOR())",
      );
    }

    const domain = await resolveDomain(client, token, chainId);
    const domainHash = hashDomain({
      domain: { ...domain, chainId: BigInt(domain.chainId) },
      types: { EIP712Domain: DOMAIN_TYPE },
    });
    if (domainHash !== separator) {
      throw new ErrorException(
        "could not reproduce the token DOMAIN_SEPARATOR; nonstandard permit implementations (e.g. DAI-style) are not supported",
      );
    }

    const value = Num(amount).toBigInt();
    const deadline =
      opts.deadline !== undefined ? Num(opts.deadline).toBigInt() : maxUint256;

    const typedData = JSON.stringify({
      types: { EIP712Domain: DOMAIN_TYPE, Permit: PERMIT_TYPE },
      primaryType: "Permit",
      domain,
      message: {
        owner,
        spender,
        value: value.toString(),
        nonce: nonce.toString(),
        deadline: deadline.toString(),
      },
    });

    const signature = (await actionCallback({
      type: "wallet",
      method: "eth_signTypedData_v4",
      params: [owner, typedData],
    })) as `0x${string}`;

    const { r, s, v, yParity } = parseSignature(signature);

    return [
      encodeAction(
        token,
        "permit(address,address,uint256,uint256,uint8,bytes32,bytes32)",
        [
          owner,
          spender,
          Num.fromBigInt(value),
          Num.fromBigInt(deadline),
          Num.fromBigInt(v ?? BigInt(yParity) + 27n),
          r,
          s,
        ],
      ),
    ];
  },
});
