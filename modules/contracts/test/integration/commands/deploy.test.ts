import "../../setup";
import { afterEach, beforeAll, beforeEach, describe, it } from "bun:test";
import { BindingsSpace } from "@evmcrispr/sdk";
import {
  expect,
  getPublicClient,
  TEST_ACCOUNT_ADDRESS,
} from "@evmcrispr/test-utils";
import { createInterpreter, describeCommand } from "@evmcrispr/test-utils/evml";
import { etherscanCreationFixtures } from "@evmcrispr/test-utils/msw/etherscan";
import type { PublicClient } from "viem";
import {
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
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
// vitalik.eth — an account with a nonzero transaction count on Gnosis.
const NONZERO_NONCE_SENDER = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const SALT_1 = pad("0x01", { size: 32 });
const SALT_2 = pad("0x02", { size: 32 });

// Source contract address used by the --source-* mirror tests.
const SOURCE_ADDR_LOWER = "0x000000000000000000000000000000000000aaaa";
const SOURCE_ADDR = getAddress(SOURCE_ADDR_LOWER as `0x${string}`);

// API key is read at command-run time from process.env, so set it once
// before any test imports take effect. The MSW handlers ignore the key.
const ORIGINAL_API_KEY = process.env.VITE_ETHERSCAN_API_KEY;
process.env.VITE_ETHERSCAN_API_KEY = "test-key";

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
  module: "contracts",
  preamble: "load contracts",
  describeName:
    "Contracts > commands > deploy <$variable> [bytecode] [opts...]",
  cases: [
    {
      name: "plain CREATE: emits a deployment action without `to` and binds the predicted address",
      script: `contracts:deploy $addr ${BYTECODE}`,
      expectedActions: [{ data: BYTECODE, from: FROM }],
      setup: (client) => client.getTransactionCount({ address: FROM }),
      validate: (_actions, interpreter, txCount: number) => {
        const expected = getContractAddress({
          from: FROM,
          nonce: BigInt(txCount),
        });
        expect(interpreter.getBinding("$addr", BindingsSpace.USER)).to.equal(
          expected,
        );
      },
    },
    {
      name: "plain CREATE: nonce increments across consecutive deploys",
      script: `contracts:deploy $a ${BYTECODE}\ncontracts:deploy $b ${BYTECODE}`,
      expectedActions: [
        { data: BYTECODE, from: FROM },
        { data: BYTECODE, from: FROM },
      ],
      setup: (client) => client.getTransactionCount({ address: FROM }),
      validate: (_actions, interpreter, txCount: number) => {
        expect(interpreter.getBinding("$a", BindingsSpace.USER)).to.equal(
          getContractAddress({ from: FROM, nonce: BigInt(txCount) }),
        );
        expect(interpreter.getBinding("$b", BindingsSpace.USER)).to.equal(
          getContractAddress({ from: FROM, nonce: BigInt(txCount + 1) }),
        );
      },
    },
    {
      name: "plain CREATE with --from: uses the provided sender for prediction",
      script: `contracts:deploy $addr ${BYTECODE} --from 0x000000000000000000000000000000000000beef`,
      expectedActions: [
        {
          data: BYTECODE,
          from: "0x000000000000000000000000000000000000beef",
        },
      ],
      setup: (client) =>
        client.getTransactionCount({
          address: "0x000000000000000000000000000000000000beef",
        }),
      validate: (_actions, interpreter, txCount: number) => {
        const expected = getContractAddress({
          from: "0x000000000000000000000000000000000000beef",
          nonce: BigInt(txCount),
        });
        expect(interpreter.getBinding("$addr", BindingsSpace.USER)).to.equal(
          expected,
        );
      },
    },
    {
      name: "plain CREATE: prediction starts from the sender's on-chain transaction count",
      // An account that has already transacted on-chain: the predicted
      // address must use its real nonce, not a zero-based counter.
      script: `contracts:deploy $addr ${BYTECODE} --from ${NONZERO_NONCE_SENDER}`,
      expectedActions: [{ data: BYTECODE, from: NONZERO_NONCE_SENDER }],
      setup: (client) =>
        client.getTransactionCount({ address: NONZERO_NONCE_SENDER }),
      validate: (_actions, interpreter, txCount: number) => {
        expect(txCount).to.be.greaterThan(0);
        expect(interpreter.getBinding("$addr", BindingsSpace.USER)).to.equal(
          getContractAddress({
            from: NONZERO_NONCE_SENDER,
            nonce: BigInt(txCount),
          }),
        );
      },
    },
    {
      name: "plain CREATE forwards tx opts (value/gas/maxFee/nonce)",
      script: `contracts:deploy $addr ${BYTECODE} --value 1e18 --gas 5000000 --max-fee-per-gas 20e9 --max-priority-fee-per-gas 2e9 --nonce 7`,
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
      validate: (_actions, interpreter) => {
        // An explicit --nonce pins the predicted address too.
        expect(interpreter.getBinding("$addr", BindingsSpace.USER)).to.equal(
          getContractAddress({ from: FROM, nonce: 7n }),
        );
      },
    },
    {
      name: "--constructor + --constructor-args: appends ABI-encoded args to bytecode",
      script: `contracts:deploy $addr ${BYTECODE} --constructor "constructor(uint256,address)" --constructor-args [1e18 0x000000000000000000000000000000000000beef]`,
      validate: (actions, interpreter) => {
        const encoded = encodeAbiParameters(
          [{ type: "uint256" }, { type: "address" }],
          [1000000000000000000n, "0x000000000000000000000000000000000000beef"],
        );
        const expectedInitCode = concatHex([BYTECODE, encoded]);
        expect(actions).to.have.length(1);
        const action = actions[0] as {
          data?: string;
          to?: string;
          from?: string;
        };
        expect(action.data).to.equal(expectedInitCode);
        expect(action.to).to.equal(undefined);
        expect(interpreter.getBinding("$addr", BindingsSpace.USER)).to.equal(
          getContractAddress({ from: FROM, nonce: 0n }),
        );
      },
    },
    {
      name: "--create2: sends salt || initCode to the Arachnid deployer and predicts via CREATE2",
      script: `contracts:deploy $addr ${BYTECODE} --create2 ${SALT_1}`,
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
        expect(interpreter.getBinding("$addr", BindingsSpace.USER)).to.equal(
          expected,
        );
      },
    },
    {
      name: "--create2 with --via: routes calldata to the custom factory",
      script: `contracts:deploy $addr ${BYTECODE} --create2 ${SALT_2} --via 0x000000000000000000000000000000000000cafe`,
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
        expect(interpreter.getBinding("$addr", BindingsSpace.USER)).to.equal(
          expected,
        );
      },
    },
    {
      name: "--create3: encodes deployCreate3 calldata for the CreateX factory and predicts via the proxy CREATE",
      script: `contracts:deploy $addr ${BYTECODE} --create3 ${SALT_1}`,
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
        expect(interpreter.getBinding("$addr", BindingsSpace.USER)).to.equal(
          expected,
        );
      },
    },
    {
      name: "--create3 with --via: targets the custom factory but keeps the same calldata convention",
      script: `contracts:deploy $addr ${BYTECODE} --create3 ${SALT_2} --via 0x000000000000000000000000000000000000c2c2`,
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
        expect(interpreter.getBinding("$addr", BindingsSpace.USER)).to.equal(
          expected,
        );
      },
    },
  ],
  errorCases: [
    {
      name: "should fail when the first argument is not a variable identifier",
      script: `contracts:deploy notavar ${BYTECODE}`,
      error: "<variable> must be a $variable",
    },
    {
      name: "should fail when bytecode is not a hex string",
      script: `contracts:deploy $addr nothex`,
      error: "[bytecode] must be a hex string",
    },
    {
      name: "should fail when bytecode is empty",
      script: `contracts:deploy $addr 0x`,
      error: "deploy: bytecode must be non-empty",
    },
    {
      name: "should fail when neither bytecode nor --mirror-address is provided",
      script: `contracts:deploy $addr`,
      error: "deploy: <bytecode> is required",
    },
    {
      name: "should fail when --constructor is set without --constructor-args",
      script: `contracts:deploy $addr ${BYTECODE} --constructor "constructor(uint256)"`,
      error: "deploy --constructor requires --constructor-args",
    },
    {
      name: "should fail when --constructor-args is set without --constructor",
      script: `contracts:deploy $addr ${BYTECODE} --constructor-args [1e18]`,
      error: "deploy --constructor-args requires --constructor",
    },
    {
      name: "should fail when constructor arg count mismatches the signature",
      script: `contracts:deploy $addr ${BYTECODE} --constructor "constructor(uint256,address)" --constructor-args [1e18]`,
      error: "constructor expects 2 argument(s), got 1",
    },
    {
      name: "should fail when both --create2 and --create3 are set",
      script: `contracts:deploy $addr ${BYTECODE} --create2 ${SALT_1} --create3 ${SALT_2}`,
      error: "--create2 and --create3 are mutually exclusive",
    },
    {
      name: "should fail when --via is set without --create2 or --create3",
      script: `contracts:deploy $addr ${BYTECODE} --via 0x000000000000000000000000000000000000beef`,
      error: "--via requires --create2 or --create3",
    },
    {
      name: "should reject permissioned CREATE3 salts (first 20 bytes match --from)",
      script: `contracts:deploy $addr ${BYTECODE} --create3 ${pad(FROM, { size: 32, dir: "right" })}`,
      error: "permissioned salts are not supported",
    },
    {
      name: "should reject zero-prefixed CREATE3 salts with cross-chain byte 0x01",
      script: `contracts:deploy $addr ${BYTECODE} --create3 ${`0x${"00".repeat(20)}01${"00".repeat(11)}` as `0x${string}`}`,
      error: "permissioned salts are not supported",
    },
    {
      name: "should fail when --mirror-chain is set without --mirror-address",
      script: `contracts:deploy $addr --mirror-chain 1`,
      error: "deploy: --mirror-chain requires --mirror-address",
    },
    {
      name: "should fail when both <bytecode> and --mirror-address are provided",
      script: `contracts:deploy $addr ${BYTECODE} --mirror-address ${SOURCE_ADDR}`,
      error: "mutually exclusive",
    },
    {
      name: "should fail when --constructor is combined with --mirror-address",
      script: `contracts:deploy $addr --mirror-address ${SOURCE_ADDR} --constructor "constructor(uint256)" --constructor-args [1e18]`,
      error:
        "--constructor / --constructor-args are not allowed with --mirror-address",
    },
    {
      name: "--mirror-chain rejects unknown chain names with a clear error",
      script: `contracts:deploy $addr --mirror-chain notarealchain --mirror-address ${SOURCE_ADDR}`,
      error: "must be a chain id or a camelCase viem chain name",
    },
  ],
});

// ── --mirror-chain / --mirror-address (mirror an existing deployment) ───

describe("Contracts > commands > deploy --mirror-chain/--mirror-address", () => {
  let client: PublicClient;

  beforeAll(() => {
    client = getPublicClient();
  });

  beforeEach(() => {
    // Reset fixtures + ensure the API key is set for each test, since
    // the verify suite (which shares the env var) may have cleared it.
    for (const k of Object.keys(etherscanCreationFixtures)) {
      delete etherscanCreationFixtures[k];
    }
    etherscanCreationFixtures[SOURCE_ADDR_LOWER] = {
      contractAddress: SOURCE_ADDR_LOWER,
      contractCreator: "0x000000000000000000000000000000000000c0de",
      txHash:
        "0xdce495a9261c4a2a5d4e879cfb55c060b4616a846d3425c441a9e31aa34c956f",
      blockNumber: "10720863",
      timestamp: "1598242563",
      contractFactory: "",
      creationBytecode: BYTECODE,
    };
    process.env.VITE_ETHERSCAN_API_KEY = "test-key";
  });

  afterEach(() => {
    for (const k of Object.keys(etherscanCreationFixtures)) {
      delete etherscanCreationFixtures[k];
    }
    if (ORIGINAL_API_KEY === undefined) {
      // Other suites in this run depend on the key being present.
      process.env.VITE_ETHERSCAN_API_KEY = "test-key";
    } else {
      process.env.VITE_ETHERSCAN_API_KEY = ORIGINAL_API_KEY;
    }
  });

  it("--mirror-chain accepts a viem chain name (e.g. `optimism`)", async () => {
    // Optimism = chain id 10. The Etherscan MSW only keys creation
    // fixtures by address, so the assertion is that the name resolves
    // and the command pulls + uses the bytecode without throwing.
    const script = `load contracts\ncontracts:deploy $addr --mirror-chain optimism --mirror-address ${SOURCE_ADDR}`;
    const interp = createInterpreter(script, client);
    const actions = await interp.interpret();

    expect(actions).to.have.length(1);
    const action = actions[0] as { data?: string };
    expect(action.data).to.equal(BYTECODE);
  });

  it("plain CREATE mirror: uses the fetched creationBytecode as init code and predicts via --from + nonce", async () => {
    const script = `load contracts\ncontracts:deploy $addr --mirror-chain 1 --mirror-address ${SOURCE_ADDR}`;
    const interp = createInterpreter(script, client);
    const actions = await interp.interpret();

    expect(actions).to.have.length(1);
    const action = actions[0] as { data?: string; to?: string; from?: string };
    expect(action.to).to.equal(undefined);
    expect(action.data).to.equal(BYTECODE);
    expect(action.from).to.equal(FROM);
    expect(interp.getBinding("$addr", BindingsSpace.USER)).to.equal(
      getContractAddress({ from: FROM, nonce: 0n }),
    );
  });

  it("--mirror-address only: defaults --mirror-chain to the current chain", async () => {
    // Re-key the fixture under the same address — this confirms that
    // when --mirror-chain is omitted the helper still hits Etherscan
    // with the *current* chain id (gnosis = 100). The MSW handler is
    // chain-agnostic, so we just need the fixture to be present.
    const script = `load contracts\ncontracts:deploy $addr --mirror-address ${SOURCE_ADDR}`;
    const interp = createInterpreter(script, client);
    const actions = await interp.interpret();
    expect(actions).to.have.length(1);
    const action = actions[0] as { data?: string };
    expect(action.data).to.equal(BYTECODE);
  });

  it("CREATE2 mirror: feeds the fetched bytecode through the Arachnid factory and predicts via CREATE2", async () => {
    const script = `load contracts\ncontracts:deploy $addr --mirror-address ${SOURCE_ADDR} --create2 ${SALT_1}`;
    const interp = createInterpreter(script, client);
    const actions = await interp.interpret();

    expect(actions).to.have.length(1);
    const action = actions[0] as { data?: string; to?: string };
    expect(action.to).to.equal(ARACHNID_CREATE2);
    expect(action.data).to.equal(concatHex([SALT_1, BYTECODE]));

    const expected = getContractAddress({
      opcode: "CREATE2",
      from: ARACHNID_CREATE2,
      salt: SALT_1,
      bytecode: BYTECODE,
    });
    expect(interp.getBinding("$addr", BindingsSpace.USER)).to.equal(expected);
  });

  it("mirror: throws when Etherscan has no creation record for the source address", async () => {
    const UNKNOWN = "0x000000000000000000000000000000000000bbbb";
    const script = `load contracts\ncontracts:deploy $addr --mirror-chain 1 --mirror-address ${UNKNOWN}`;
    const interp = createInterpreter(script, client);
    let caught: Error | undefined;
    try {
      await interp.interpret();
    } catch (e: any) {
      caught = e;
    }
    expect(caught).to.not.equal(undefined);
    expect(caught!.message).to.include("no creation record");
    expect(caught!.message).to.include("chain 1");
  });

  it("mirror: throws when Etherscan returns a creation record without creationBytecode", async () => {
    const NO_BYTECODE_LOWER = "0x000000000000000000000000000000000000cccc";
    etherscanCreationFixtures[NO_BYTECODE_LOWER] = {
      contractAddress: NO_BYTECODE_LOWER,
      contractCreator: "0x000000000000000000000000000000000000c0de",
      txHash: "0x0",
      blockNumber: "1",
      timestamp: "1",
      contractFactory: "",
      // creationBytecode intentionally omitted (older Etherscan
      // snapshots don't include it).
    };
    const script = `load contracts\ncontracts:deploy $addr --mirror-chain 1 --mirror-address ${getAddress(NO_BYTECODE_LOWER as `0x${string}`)}`;
    const interp = createInterpreter(script, client);
    let caught: Error | undefined;
    try {
      await interp.interpret();
    } catch (e: any) {
      caught = e;
    }
    expect(caught).to.not.equal(undefined);
    expect(caught!.message).to.include("did not return creationBytecode");
  });

  it("mirror: throws a clear error when VITE_ETHERSCAN_API_KEY is unset", async () => {
    delete process.env.VITE_ETHERSCAN_API_KEY;
    try {
      const script = `load contracts\ncontracts:deploy $addr --mirror-chain 1 --mirror-address ${SOURCE_ADDR}`;
      const interp = createInterpreter(script, client);
      let caught: Error | undefined;
      try {
        await interp.interpret();
      } catch (e: any) {
        caught = e;
      }
      expect(caught).to.not.equal(undefined);
      expect(caught!.message).to.include("VITE_ETHERSCAN_API_KEY");
    } finally {
      process.env.VITE_ETHERSCAN_API_KEY = "test-key";
    }
  });
});
