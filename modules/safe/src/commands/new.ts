import type { Address } from "@evmcrispr/sdk";
import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import {
  concatHex,
  encodeFunctionData,
  getContractAddress,
  keccak256,
  parseAbi,
  toHex,
  zeroAddress,
} from "viem";
import type Safe from "..";
import {
  COMPATIBILITY_FALLBACK_HANDLER,
  SAFE_L2_SINGLETON,
  SAFE_PROXY_FACTORY,
} from "../addresses";
import { toBigInt } from "../utils";

const factoryAbi = parseAbi([
  "function createProxyWithNonce(address _singleton, bytes initializer, uint256 saltNonce) returns (address proxy)",
  "function proxyCreationCode() pure returns (bytes)",
]);

const setupAbi = parseAbi([
  "function setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)",
]);

export default defineCommand<Safe>({
  name: "new",
  description:
    "Deploy a new Safe (v1.4.1 L2 singleton) with the given owners, at a deterministic address.",
  args: [
    {
      name: "owners",
      type: "address",
      rest: true,
      description: "Owner addresses",
    },
  ],
  opts: [
    {
      name: "threshold",
      type: "number",
      description: "Signature threshold (defaults to 1)",
    },
    {
      name: "salt",
      type: "number",
      description: "Deployment salt nonce (defaults to 0)",
    },
  ],
  async run(module, { owners }, { opts }) {
    if (!owners?.length) {
      throw new ErrorException("at least one owner is required");
    }

    const threshold =
      opts.threshold !== undefined ? toBigInt(opts.threshold) : 1n;
    if (threshold < 1n || threshold > BigInt(owners.length)) {
      throw new ErrorException(
        `threshold must be between 1 and ${owners.length} (the number of owners)`,
      );
    }
    const saltNonce = opts.salt !== undefined ? toBigInt(opts.salt) : 0n;

    const initializer = encodeFunctionData({
      abi: setupAbi,
      functionName: "setup",
      args: [
        owners as Address[],
        threshold,
        zeroAddress,
        "0x",
        COMPATIBILITY_FALLBACK_HANDLER,
        zeroAddress,
        0n,
        zeroAddress,
      ],
    });

    // Predict the CREATE2 address the factory will deploy to: init code is
    // the proxy creation code with the singleton appended as its only
    // constructor param, salted with keccak256(initializer) ++ saltNonce.
    const client = await module.getClient();
    const creationCode = await client.readContract({
      address: SAFE_PROXY_FACTORY,
      abi: factoryAbi,
      functionName: "proxyCreationCode",
    });
    const predicted = getContractAddress({
      opcode: "CREATE2",
      from: SAFE_PROXY_FACTORY,
      salt: keccak256(
        concatHex([keccak256(initializer), toHex(saltNonce, { size: 32 })]),
      ),
      bytecode: concatHex([
        creationCode,
        toHex(BigInt(SAFE_L2_SINGLETON), { size: 32 }),
      ]),
    });

    module.context.log(`Deploying new Safe at ${predicted}`);

    return [
      {
        to: SAFE_PROXY_FACTORY,
        data: encodeFunctionData({
          abi: factoryAbi,
          functionName: "createProxyWithNonce",
          args: [SAFE_L2_SINGLETON, initializer, saltNonce],
        }),
      },
    ];
  },
});
