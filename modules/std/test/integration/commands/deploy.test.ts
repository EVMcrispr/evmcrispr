import "../../setup";
import { BindingsSpace } from "@evmcrispr/sdk";
import {
  describeCommand,
  expect,
  TEST_ACCOUNT_ADDRESS,
} from "@evmcrispr/test-utils";
import {
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  getContractAddress,
  keccak256,
  pad,
  parseAbiItem,
} from "viem";

const ARACHNID_CREATE2 = "0x4e59b44847b379578588920ca78fbf26c0b4956c";
const CREATEX = "0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed";
const CREATE3_PROXY_INITCODE =
  "0x67363d3d37363d34f03d5260086018f3" as `0x${string}`;
const CREATE3_PROXY_INITCODE_HASH = keccak256(CREATE3_PROXY_INITCODE);
const CREATEX_DEPLOY_CREATE3_ABI = parseAbiItem(
  "function deployCreate3(bytes32 salt, bytes initCode) returns (address)",
);

// Minimal contract creation bytecode that returns empty runtime.
const BYTECODE =
  "0x6080604052348015600f57600080fd5b50603f80601d6000396000f3fe6080604052600080fdfea2646970667358221220abcd";

const FROM = TEST_ACCOUNT_ADDRESS as `0x${string}`;
const SALT_1 = pad("0x01", { size: 32 });
const SALT_2 = pad("0x02", { size: 32 });

function predictCreate3(
  factory: `0x${string}`,
  salt: `0x${string}`,
): `0x${string}` {
  const guardedSalt = keccak256(
    encodeAbiParameters([{ type: "bytes32" }], [salt]),
  );
  const proxy = getContractAddress({
    opcode: "CREATE2",
    from: factory,
    salt: guardedSalt,
    bytecodeHash: CREATE3_PROXY_INITCODE_HASH,
  });
  return getContractAddress({ from: proxy, nonce: 1n });
}

describeCommand("deploy", {
  describeName:
    "Std > commands > deploy <$variable> <bytecode> [opts...]",
  cases: [
    {
      name: "plain CREATE: emits a deployment action without `to` and binds the predicted address",
      script: `deploy $addr ${BYTECODE}`,
      expectedActions: [{ data: BYTECODE, from: FROM }],
      validate: (_actions, interpreter) => {
        const expected = getContractAddress({ from: FROM, nonce: 0n });
        expect(
          interpreter.getBinding("$addr", BindingsSpace.USER),
        ).to.equal(expected);
      },
    },
    {
      name: "plain CREATE: nonce increments across consecutive deploys",
      script: `deploy $a ${BYTECODE}\ndeploy $b ${BYTECODE}`,
      expectedActions: [
        { data: BYTECODE, from: FROM },
        { data: BYTECODE, from: FROM },
      ],
      validate: (_actions, interpreter) => {
        expect(interpreter.getBinding("$a", BindingsSpace.USER)).to.equal(
          getContractAddress({ from: FROM, nonce: 0n }),
        );
        expect(interpreter.getBinding("$b", BindingsSpace.USER)).to.equal(
          getContractAddress({ from: FROM, nonce: 1n }),
        );
      },
    },
    {
      name: "plain CREATE with --from: uses the provided sender for prediction",
      script: `deploy $addr ${BYTECODE} --from 0x000000000000000000000000000000000000beef`,
      expectedActions: [
        {
          data: BYTECODE,
          from: "0x000000000000000000000000000000000000beef",
        },
      ],
      validate: (_actions, interpreter) => {
        const expected = getContractAddress({
          from: "0x000000000000000000000000000000000000beef",
          nonce: 0n,
        });
        expect(
          interpreter.getBinding("$addr", BindingsSpace.USER),
        ).to.equal(expected);
      },
    },
    {
      name: "plain CREATE forwards tx opts (value/gas/maxFee/nonce)",
      script: `deploy $addr ${BYTECODE} --value 1e18 --gas 5000000 --max-fee-per-gas 20e9 --max-priority-fee-per-gas 2e9 --nonce 7`,
      expectedActions: [
        {
          data: BYTECODE,
          from: FROM,
          value: 1000000000000000000n,
          gas: 5000000n,
          maxFeePerGas: 20000000000n,
          maxPriorityFeePerGas: 2000000000n,
          nonce: 7,
        },
      ],
    },
    {
      name: "--constructor + --constructor-args: appends ABI-encoded args to bytecode",
      script: `deploy $addr ${BYTECODE} --constructor "constructor(uint256,address)" --constructor-args [1e18 0x000000000000000000000000000000000000beef]`,
      validate: (actions, interpreter) => {
        const encoded = encodeAbiParameters(
          [{ type: "uint256" }, { type: "address" }],
          [
            1000000000000000000n,
            "0x000000000000000000000000000000000000beef",
          ],
        );
        const expectedInitCode = concatHex([BYTECODE, encoded]);
        expect(actions).to.have.length(1);
        const action = actions[0] as { data?: string; to?: string; from?: string };
        expect(action.data).to.equal(expectedInitCode);
        expect(action.to).to.equal(undefined);
        expect(
          interpreter.getBinding("$addr", BindingsSpace.USER),
        ).to.equal(getContractAddress({ from: FROM, nonce: 0n }));
      },
    },
    {
      name: "--create2: sends salt || initCode to the Arachnid deployer and predicts via CREATE2",
      script: `deploy $addr ${BYTECODE} --create2 ${SALT_1}`,
      expectedActions: [
        {
          to: ARACHNID_CREATE2,
          data: concatHex([SALT_1, BYTECODE]),
          from: FROM,
        },
      ],
      validate: (_actions, interpreter) => {
        const expected = getContractAddress({
          opcode: "CREATE2",
          from: ARACHNID_CREATE2,
          salt: SALT_1,
          bytecode: BYTECODE,
        });
        expect(
          interpreter.getBinding("$addr", BindingsSpace.USER),
        ).to.equal(expected);
      },
    },
    {
      name: "--create2 with --via: routes calldata to the custom factory",
      script: `deploy $addr ${BYTECODE} --create2 ${SALT_2} --via 0x000000000000000000000000000000000000cafe`,
      expectedActions: [
        {
          to: "0x000000000000000000000000000000000000cafe",
          data: concatHex([SALT_2, BYTECODE]),
          from: FROM,
        },
      ],
      validate: (_actions, interpreter) => {
        const expected = getContractAddress({
          opcode: "CREATE2",
          from: "0x000000000000000000000000000000000000cafe",
          salt: SALT_2,
          bytecode: BYTECODE,
        });
        expect(
          interpreter.getBinding("$addr", BindingsSpace.USER),
        ).to.equal(expected);
      },
    },
    {
      name: "--create3: encodes deployCreate3 calldata for the CreateX factory and predicts via the proxy CREATE",
      script: `deploy $addr ${BYTECODE} --create3 ${SALT_1}`,
      expectedActions: [
        {
          to: CREATEX,
          data: encodeFunctionData({
            abi: [CREATEX_DEPLOY_CREATE3_ABI],
            functionName: "deployCreate3",
            args: [SALT_1, BYTECODE],
          }),
          from: FROM,
        },
      ],
      validate: (_actions, interpreter) => {
        const expected = predictCreate3(CREATEX, SALT_1);
        expect(
          interpreter.getBinding("$addr", BindingsSpace.USER),
        ).to.equal(expected);
      },
    },
    {
      name: "--create3 with --via: targets the custom factory but keeps the same calldata convention",
      script: `deploy $addr ${BYTECODE} --create3 ${SALT_2} --via 0x000000000000000000000000000000000000c2c2`,
      validate: (actions, interpreter) => {
        const expected = predictCreate3(
          "0x000000000000000000000000000000000000c2c2",
          SALT_2,
        );
        expect(actions).to.have.length(1);
        const action = actions[0] as { to?: string; data?: string };
        expect(action.to).to.equal(
          "0x000000000000000000000000000000000000c2c2",
        );
        expect(action.data).to.equal(
          encodeFunctionData({
            abi: [CREATEX_DEPLOY_CREATE3_ABI],
            functionName: "deployCreate3",
            args: [SALT_2, BYTECODE],
          }),
        );
        expect(
          interpreter.getBinding("$addr", BindingsSpace.USER),
        ).to.equal(expected);
      },
    },
  ],
  errorCases: [
    {
      name: "should fail when the first argument is not a variable identifier",
      script: `deploy notavar ${BYTECODE}`,
      error: "<variable> must be a $variable",
    },
    {
      name: "should fail when bytecode is not a hex string",
      script: `deploy $addr nothex`,
      error: "<bytecode> must be a hex string",
    },
    {
      name: "should fail when bytecode is empty",
      script: `deploy $addr 0x`,
      error: "deploy: bytecode must be non-empty",
    },
    {
      name: "should fail when --constructor is set without --constructor-args",
      script: `deploy $addr ${BYTECODE} --constructor "constructor(uint256)"`,
      error: "deploy --constructor requires --constructor-args",
    },
    {
      name: "should fail when --constructor-args is set without --constructor",
      script: `deploy $addr ${BYTECODE} --constructor-args [1e18]`,
      error: "deploy --constructor-args requires --constructor",
    },
    {
      name: "should fail when constructor arg count mismatches the signature",
      script: `deploy $addr ${BYTECODE} --constructor "constructor(uint256,address)" --constructor-args [1e18]`,
      error: "constructor expects 2 argument(s), got 1",
    },
    {
      name: "should fail when both --create2 and --create3 are set",
      script: `deploy $addr ${BYTECODE} --create2 ${SALT_1} --create3 ${SALT_2}`,
      error: "--create2 and --create3 are mutually exclusive",
    },
    {
      name: "should fail when --via is set without --create2 or --create3",
      script: `deploy $addr ${BYTECODE} --via 0x000000000000000000000000000000000000beef`,
      error: "--via requires --create2 or --create3",
    },
    {
      name: "should reject permissioned CREATE3 salts (first 20 bytes match --from)",
      script: `deploy $addr ${BYTECODE} --create3 ${pad(FROM, { size: 32, dir: "right" })}`,
      error: "permissioned salts are not supported",
    },
    {
      name: "should reject zero-prefixed CREATE3 salts with cross-chain byte 0x01",
      script: `deploy $addr ${BYTECODE} --create3 ${`0x${"00".repeat(20)}01${"00".repeat(11)}` as `0x${string}`}`,
      error: "permissioned salts are not supported",
    },
  ],
});
