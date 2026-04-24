import type { Param, TransactionAction } from "@evmcrispr/sdk";
import {
  BindingsSpace,
  defineCommand,
  encodeConstructorParams,
  ErrorException,
} from "@evmcrispr/sdk";
import {
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  getContractAddress,
  isAddressEqual,
  keccak256,
  pad,
  parseAbiItem,
  size,
  slice,
  zeroAddress,
} from "viem";
import type Std from "..";

const ARACHNID_CREATE2 = "0x4e59b44847b379578588920ca78fbf26c0b4956c";
const CREATEX = "0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed";
const CREATE3_PROXY_INITCODE =
  "0x67363d3d37363d34f03d5260086018f3" as `0x${string}`;
const CREATE3_PROXY_INITCODE_HASH = keccak256(CREATE3_PROXY_INITCODE);
const CREATEX_DEPLOY_CREATE3_ABI = parseAbiItem(
  "function deployCreate3(bytes32 salt, bytes initCode) returns (address)",
);
const ZERO_ADDR_BYTES20 = pad("0x", { size: 20 });

export default defineCommand<Std>({
  name: "deploy",
  description:
    "Deploy a contract from raw creation bytecode. Binds the predicted address to <variable>.",
  args: [
    {
      name: "variable",
      type: "variable",
      description: "Variable to bind the deployed contract address to",
    },
    {
      name: "bytecode",
      type: "bytes",
      description:
        "Creation bytecode. Constructor args are appended automatically when --constructor is set.",
    },
  ],
  opts: [
    {
      name: "constructor",
      type: "string",
      description:
        "Constructor signature like `constructor(uint256,address)`. Requires --constructor-args.",
    },
    {
      name: "constructor-args",
      type: "array",
      description:
        "Constructor arguments as an array literal, e.g. [100e18 @me true]. Requires --constructor.",
    },
    {
      name: "create2",
      type: "bytes32",
      description:
        "Salt for CREATE2 deployment. Defaults to the Arachnid deterministic deployer; override factory with --via.",
    },
    {
      name: "create3",
      type: "bytes32",
      description:
        "Salt for CREATE3 deployment. Defaults to the CreateX factory; override with --via.",
    },
    {
      name: "via",
      type: "address",
      description:
        "Override the default factory address used by --create2 / --create3.",
    },
    {
      name: "from",
      type: "address",
      description:
        "Sender address. Defaults to the connected wallet. For plain CREATE this is also the prediction deployer.",
    },
    {
      name: "value",
      type: "number",
      description: "ETH to send with the deployment (in wei)",
    },
    { name: "gas", type: "number", description: "Gas limit" },
    {
      name: "max-fee-per-gas",
      type: "number",
      description: "Max fee per gas (EIP-1559)",
    },
    {
      name: "max-priority-fee-per-gas",
      type: "number",
      description: "Max priority fee per gas (EIP-1559)",
    },
    {
      name: "nonce",
      type: "number",
      description: "Transaction nonce override",
    },
  ],
  async run(module, { variable, bytecode }, { opts }) {
    const ctorSig = Object.hasOwn(opts, "constructor")
      ? (opts["constructor"] as string | undefined)
      : undefined;
    const ctorArgs = opts["constructor-args"] as Param[] | undefined;

    if (ctorSig && !ctorArgs) {
      throw new ErrorException(
        "deploy --constructor requires --constructor-args (use [] for zero args)",
      );
    }
    if (!ctorSig && ctorArgs) {
      throw new ErrorException(
        "deploy --constructor-args requires --constructor",
      );
    }
    if (opts.create2 && opts.create3) {
      throw new ErrorException(
        "deploy: --create2 and --create3 are mutually exclusive",
      );
    }
    if (opts.via && !opts.create2 && !opts.create3) {
      throw new ErrorException(
        "deploy: --via requires --create2 or --create3",
      );
    }

    let initCode = bytecode as `0x${string}`;
    if (ctorSig) {
      const encoded = encodeConstructorParams(ctorSig, ctorArgs ?? []);
      initCode = concatHex([initCode, encoded]);
    }

    const from =
      (opts.from as `0x${string}` | undefined) ??
      (await module.getConnectedAccount());

    let action: TransactionAction;
    let predicted: `0x${string}`;

    if (opts.create2) {
      const salt = pad(opts.create2 as `0x${string}`, { size: 32 });
      const factory =
        (opts.via as `0x${string}` | undefined) ??
        (ARACHNID_CREATE2 as `0x${string}`);
      predicted = getContractAddress({
        opcode: "CREATE2",
        from: factory,
        salt,
        bytecode: initCode,
      });
      action = {
        to: factory,
        data: concatHex([salt, initCode]),
        from,
      };
    } else if (opts.create3) {
      const salt = pad(opts.create3 as `0x${string}`, { size: 32 });
      const factory =
        (opts.via as `0x${string}` | undefined) ??
        (CREATEX as `0x${string}`);

      // Reject CreateX-style permissioned salts so client-side prediction stays
      // deterministic. See CreateX `_guard` logic:
      //   https://github.com/pcaversaccio/createx/blob/main/src/CreateX.sol
      const saltSenderPrefix = slice(salt, 0, 20);
      const saltCrossChainByte = slice(salt, 20, 21);
      const isPermissioned = isAddressEqual(
        saltSenderPrefix as `0x${string}`,
        from,
      );
      const isZeroProtected =
        saltSenderPrefix === ZERO_ADDR_BYTES20 &&
        saltCrossChainByte === "0x01";
      if (isPermissioned || isZeroProtected) {
        throw new ErrorException(
          "deploy --create3: permissioned salts are not supported (first 20 bytes of salt must not equal --from, and a zero-prefixed salt must not have 0x01 in byte 20)",
        );
      }

      const guardedSalt = keccak256(
        encodeAbiParameters([{ type: "bytes32" }], [salt]),
      );
      const proxy = getContractAddress({
        opcode: "CREATE2",
        from: factory,
        salt: guardedSalt,
        bytecodeHash: CREATE3_PROXY_INITCODE_HASH,
      });
      predicted = getContractAddress({ from: proxy, nonce: 1n });

      const data = encodeFunctionData({
        abi: [CREATEX_DEPLOY_CREATE3_ABI],
        functionName: "deployCreate3",
        args: [salt, initCode],
      });
      action = { to: factory, data, from };
    } else {
      const nonce = BigInt(await module.incrementNonce(from));
      predicted = getContractAddress({ from, nonce });
      action = { data: initCode, from };
    }

    if (opts.value !== undefined) {
      action.value = BigInt(opts.value);
    }
    if (opts.gas !== undefined) {
      action.gas = BigInt(opts.gas);
    }
    if (opts["max-fee-per-gas"] !== undefined) {
      action.maxFeePerGas = BigInt(opts["max-fee-per-gas"]);
    }
    if (opts["max-priority-fee-per-gas"] !== undefined) {
      action.maxPriorityFeePerGas = BigInt(opts["max-priority-fee-per-gas"]);
    }
    if (opts.nonce !== undefined) {
      action.nonce = Number(opts.nonce);
    }

    if (size(initCode) === 0) {
      throw new ErrorException("deploy: bytecode must be non-empty");
    }

    if (predicted === zeroAddress) {
      throw new ErrorException("deploy: predicted address is zero");
    }

    module.bindingsManager.setBinding(
      variable,
      predicted,
      BindingsSpace.USER,
      true,
      undefined,
      true,
    );

    return [action];
  },
});
