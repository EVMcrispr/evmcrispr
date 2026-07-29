import "../setup";
import { beforeAll, describe, it } from "bun:test";
import type { Action, Address } from "@evmcrispr/sdk";
import {
  BindingsSpace,
  isTransactionAction,
  isWalletAction,
} from "@evmcrispr/sdk";
import {
  expect,
  getPublicClient,
  getTransports,
  getWalletClients,
} from "@evmcrispr/test-utils";
import { evml, Interpreter } from "@evmcrispr/test-utils/evml";
import type { PublicClient, WalletClient } from "viem";
import {
  concatHex,
  encodeFunctionData,
  getContractAddress,
  hashMessage,
  keccak256,
  parseAbi,
  toHex,
  zeroAddress,
} from "viem";
import { gnosis } from "viem/chains";
import {
  DELAY_MASTERCOPIES,
  SAFE_L2_SINGLETON,
  SAFE_PROXY_FACTORY,
} from "../../src/addresses";
import type { SafeTx } from "../../src/utils";
import {
  encodeSetUp,
  getSafeTxTypedData,
  pickDeployedMastercopy,
  predictZodiacModuleAddress,
} from "../../src/utils";
import { serviceState } from "../fixtures/msw-handlers";

const factoryAbi = parseAbi([
  "function proxyCreationCode() pure returns (bytes)",
]);

const safeAbi = parseAbi([
  "function setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)",
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function nonce() view returns (uint256)",
  "function isModuleEnabled(address module) view returns (bool)",
  "function changeThreshold(uint256 _threshold)",
  "function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) view returns (bytes32)",
  "function domainSeparator() view returns (bytes32)",
  "function getMessageHash(bytes message) view returns (bytes32)",
  "function approveHash(bytes32 hashToApprove)",
]);

const delayAbi = parseAbi(["function txCooldown() view returns (uint256)"]);

const COMPATIBILITY_FALLBACK_HANDLER =
  "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99";

describe("Safe > integration", () => {
  let client: PublicClient;
  let wallets: WalletClient[];
  let ownerA: Address;
  let ownerB: Address;
  let ownerC: Address;
  let ownerD: Address;
  let safe: Address;
  let delay: Address;
  const deploySalt = BigInt(Date.now());

  const run = async (script: string, account?: Address) => {
    const logs: string[] = [];
    const evm = new Interpreter(evml.registry, {
      account: account ?? ownerA,
      transports: getTransports(),
      onLog: (message: string) => logs.push(message),
    });
    evm.switchChainId(gnosis.id);

    const actionCallback = async (action: Action) => {
      if (isTransactionAction(action)) {
        const wallet = wallets.find(
          (w) =>
            !action.from ||
            w.account!.address.toLowerCase() === action.from.toLowerCase(),
        )!;
        const hash = await wallet.sendTransaction({
          account: wallet.account!,
          chain: gnosis,
          to: action.to,
          data: action.data,
          value: action.value,
          gas: 2_000_000n,
        });
        return client.waitForTransactionReceipt({ hash });
      }
      if (isWalletAction(action) && action.method === "eth_signTypedData_v4") {
        const [signer, json] = action.params as [Address, string];
        const typedData = JSON.parse(json);
        const wallet = wallets.find(
          (w) => w.account!.address.toLowerCase() === signer.toLowerCase(),
        )!;
        const m = typedData.message;
        return (wallet.account as any).signTypedData({
          domain: {
            chainId: BigInt(typedData.domain.chainId),
            verifyingContract: typedData.domain.verifyingContract,
          },
          types: { SafeTx: typedData.types.SafeTx },
          primaryType: "SafeTx",
          message: {
            ...m,
            value: BigInt(m.value),
            operation: Number(m.operation),
            safeTxGas: BigInt(m.safeTxGas),
            baseGas: BigInt(m.baseGas),
            gasPrice: BigInt(m.gasPrice),
            nonce: BigInt(m.nonce),
          },
        });
      }
      throw new Error(`Unexpected action: ${JSON.stringify(action)}`);
    };

    await evm.interpret(script, actionCallback);
    return Object.assign(evm, { logs });
  };

  const getOwners = () =>
    client.readContract({
      address: safe,
      abi: safeAbi,
      functionName: "getOwners",
    });
  const getThreshold = () =>
    client.readContract({
      address: safe,
      abi: safeAbi,
      functionName: "getThreshold",
    });

  beforeAll(() => {
    client = getPublicClient();
    wallets = getWalletClients();
    [ownerA, ownerB, ownerC, ownerD] = wallets.map(
      (w) => w.account!.address,
    ) as Address[];
  });

  it("deploys a new Safe at a deterministic address", async () => {
    // Predict the address independently from the command's implementation
    const initializer = encodeFunctionData({
      abi: safeAbi,
      functionName: "setup",
      args: [
        [ownerA],
        1n,
        zeroAddress,
        "0x",
        COMPATIBILITY_FALLBACK_HANDLER,
        zeroAddress,
        0n,
        zeroAddress,
      ],
    });
    const creationCode = await client.readContract({
      address: SAFE_PROXY_FACTORY,
      abi: factoryAbi,
      functionName: "proxyCreationCode",
    });
    safe = getContractAddress({
      opcode: "CREATE2",
      from: SAFE_PROXY_FACTORY,
      salt: keccak256(
        concatHex([keccak256(initializer), toHex(deploySalt, { size: 32 })]),
      ),
      bytecode: concatHex([
        creationCode,
        toHex(BigInt(SAFE_L2_SINGLETON), { size: 32 }),
      ]),
    });

    await run(`load safe\nsafe:new ${ownerA} --salt ${deploySalt}`);

    expect(await client.getCode({ address: safe })).to.not.be.undefined;
    expect(await getOwners()).to.eql([ownerA]);
    expect(await getThreshold()).to.equal(1n);
  });

  it("executes a single-action block through execTransaction", async () => {
    await run(
      `load safe\nsafe:execute ${safe} (\n  safe:add-owner ${ownerB}\n)`,
    );

    expect(await getOwners()).to.eql([ownerB, ownerA]);
    expect(await getThreshold()).to.equal(1n);
  });

  it("executes a multi-action block via MultiSendCallOnly and installs a Delay modifier", async () => {
    const initializer = encodeSetUp(
      "address owner, address avatar, address target, uint256 cooldown, uint256 expiration",
      [safe, safe, safe, 3600n, 0n],
    );
    const mastercopy = await pickDeployedMastercopy(
      client,
      DELAY_MASTERCOPIES,
      "Delay modifier",
    );
    delay = predictZodiacModuleAddress(mastercopy, initializer, 0n);

    await run(
      `load safe\nsafe:execute ${safe} (\n  safe:add-owner ${ownerC}\n  safe:install-delay 3600\n)`,
    );

    expect(await getOwners()).to.eql([ownerC, ownerB, ownerA]);
    expect(await client.getCode({ address: delay })).to.not.be.undefined;
    expect(
      await client.readContract({
        address: safe,
        abi: safeAbi,
        functionName: "isModuleEnabled",
        args: [delay],
      }),
    ).to.be.true;
    expect(
      await client.readContract({
        address: delay,
        abi: delayAbi,
        functionName: "txCooldown",
      }),
    ).to.equal(3600n);
  });

  it("swaps an owner", async () => {
    await run(
      `load safe\nsafe:execute ${safe} (\n  safe:swap-owner ${ownerC} for ${ownerD}\n)`,
    );

    expect(await getOwners()).to.eql([ownerD, ownerB, ownerA]);
  });

  it("removes an owner", async () => {
    await run(
      `load safe\nsafe:execute ${safe} (\n  safe:remove-owner ${ownerD}\n)`,
    );

    expect(await getOwners()).to.eql([ownerB, ownerA]);
  });

  it("disables a module", async () => {
    await run(
      `load safe\nsafe:execute ${safe} (\n  safe:disable-module ${delay}\n)`,
    );

    expect(
      await client.readContract({
        address: safe,
        abi: safeAbi,
        functionName: "isModuleEnabled",
        args: [delay],
      }),
    ).to.be.false;
  });

  it("reads Safe state through helpers", async () => {
    const evm = await run(
      [
        "load safe",
        `set $owners @safe:owners(${safe})`,
        `set $threshold @safe:threshold(${safe})`,
        `set $isOwner @safe:isOwner(${ownerB} ${safe})`,
        `set $isNotOwner @safe:isOwner(${ownerD} ${safe})`,
        `set $modules @safe:modules(${safe})`,
        `set $guard @safe:guard(${safe})`,
      ].join("\n"),
    );

    const { USER } = BindingsSpace;
    expect(evm.getBinding("$owners", USER)).to.eql([ownerB, ownerA]);
    expect(String(evm.getBinding("$threshold", USER))).to.equal("1");
    expect(evm.getBinding("$isOwner", USER)).to.be.true;
    expect(evm.getBinding("$isNotOwner", USER)).to.be.false;
    expect(evm.getBinding("$modules", USER)).to.eql([]);
    expect(evm.getBinding("$guard", USER)).to.equal(zeroAddress);
  });

  it("proposes a transaction to the Safe Transaction Service", async () => {
    serviceState.reset();

    const evm = await run(
      `load safe\nsafe:propose ${safe} (\n  exec ${safe} changeThreshold(uint256) 2\n)`,
    );

    expect(serviceState.proposals.length).to.equal(1);
    const proposal = serviceState.proposals[0];

    const expectedData = encodeFunctionData({
      abi: safeAbi,
      functionName: "changeThreshold",
      args: [2n],
    });
    const nonce = await client.readContract({
      address: safe,
      abi: safeAbi,
      functionName: "nonce",
    });
    const expectedHash = await client.readContract({
      address: safe,
      abi: safeAbi,
      functionName: "getTransactionHash",
      args: [
        safe,
        0n,
        expectedData,
        0,
        0n,
        0n,
        0n,
        zeroAddress,
        zeroAddress,
        nonce,
      ],
    });

    expect(proposal.safe).to.equal(safe);
    expect(proposal.to).to.equal(safe);
    expect(proposal.data).to.equal(expectedData);
    expect(proposal.operation).to.equal(0);
    expect(proposal.nonce).to.equal(nonce.toString());
    expect(proposal.contractTransactionHash).to.equal(expectedHash);
    expect(proposal.sender).to.equal(ownerA);
    expect(proposal.origin).to.equal("evmcrispr");
    // 65-byte ECDSA signature
    expect(proposal.signature.length).to.equal(2 + 65 * 2);

    // The hashes were printed before the signature request so the signer
    // could cross-check them against the wallet display.
    const hashLog = evm.logs.find((l) => l.includes("safeTxHash:"));
    const domainSeparator = await client.readContract({
      address: safe,
      abi: safeAbi,
      functionName: "domainSeparator",
    });
    expect(hashLog).to.include(expectedHash);
    expect(hashLog).to.include(domainSeparator);
  });

  it("executes a fully-confirmed queued transaction by hash", async () => {
    // Raise the threshold to 2 so direct block execution is rejected...
    await run(
      `load safe\nsafe:execute ${safe} (\n  safe:change-threshold 2\n)`,
    );
    expect(await getThreshold()).to.equal(2n);

    const execError = await run(
      `load safe\nsafe:execute ${safe} (\n  safe:remove-guard\n)`,
    ).then(
      () => null,
      (err) => err,
    );
    expect(String(execError?.message)).to.include("use safe:propose");

    // ...then queue a changeThreshold(1) on the mocked service, confirmed
    // by both owners, and execute it by hash.
    const data = encodeFunctionData({
      abi: safeAbi,
      functionName: "changeThreshold",
      args: [1n],
    });
    const nonce = await client.readContract({
      address: safe,
      abi: safeAbi,
      functionName: "nonce",
    });
    const tx: SafeTx = {
      to: safe,
      value: 0n,
      data,
      operation: 0,
      safeTxGas: 0n,
      baseGas: 0n,
      gasPrice: 0n,
      gasToken: zeroAddress,
      refundReceiver: zeroAddress,
      nonce,
    };
    const safeTxHash = await client.readContract({
      address: safe,
      abi: safeAbi,
      functionName: "getTransactionHash",
      args: [
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        0n,
        0n,
        0n,
        zeroAddress,
        zeroAddress,
        nonce,
      ],
    });

    const typedData = getSafeTxTypedData(gnosis.id, safe, tx);
    const sign = (i: number) =>
      (wallets[i].account as any).signTypedData({
        domain: typedData.domain,
        types: { SafeTx: typedData.types.SafeTx },
        primaryType: "SafeTx",
        message: typedData.message,
      });

    // Deliberately unsorted to exercise ascending-owner signature packing
    serviceState.transactions.set(safeTxHash.toLowerCase(), {
      safe,
      to: tx.to,
      value: "0",
      data,
      operation: 0,
      safeTxGas: "0",
      baseGas: "0",
      gasPrice: "0",
      gasToken: zeroAddress,
      refundReceiver: zeroAddress,
      nonce: nonce.toString(),
      safeTxHash,
      confirmationsRequired: 2,
      isExecuted: false,
      confirmations: [
        { owner: ownerB, signature: await sign(1) },
        { owner: ownerA, signature: await sign(0) },
      ],
    });

    await run(`load safe\nsafe:execute ${safe} ${safeTxHash}`);

    expect(await getThreshold()).to.equal(1n);
  });

  // Seed a queued transaction on the mocked service whose stored safeTxHash
  // is computed on-chain (or overridden, to simulate a tampered service).
  const seedQueuedTx = async (
    overrides: Partial<SafeTx> = {},
    storedHash?: `0x${string}`,
  ) => {
    const nonce = await client.readContract({
      address: safe,
      abi: safeAbi,
      functionName: "nonce",
    });
    const tx: SafeTx = {
      to: safe,
      value: 0n,
      data: encodeFunctionData({
        abi: safeAbi,
        functionName: "changeThreshold",
        args: [2n],
      }),
      operation: 0,
      safeTxGas: 0n,
      baseGas: 0n,
      gasPrice: 0n,
      gasToken: zeroAddress,
      refundReceiver: zeroAddress,
      nonce,
      ...overrides,
    };
    const safeTxHash =
      storedHash ??
      (await client.readContract({
        address: safe,
        abi: safeAbi,
        functionName: "getTransactionHash",
        args: [
          tx.to,
          tx.value,
          tx.data,
          tx.operation,
          tx.safeTxGas,
          tx.baseGas,
          tx.gasPrice,
          tx.gasToken,
          tx.refundReceiver,
          tx.nonce,
        ],
      }));
    serviceState.transactions.set(safeTxHash.toLowerCase(), {
      safe,
      to: tx.to,
      value: tx.value.toString(),
      data: tx.data,
      operation: tx.operation,
      safeTxGas: tx.safeTxGas.toString(),
      baseGas: tx.baseGas.toString(),
      gasPrice: tx.gasPrice.toString(),
      gasToken: tx.gasToken,
      refundReceiver: tx.refundReceiver,
      nonce: tx.nonce.toString(),
      safeTxHash,
      confirmationsRequired: 1,
      isExecuted: false,
      confirmations: [],
    });
    return { tx, safeTxHash, nonce };
  };

  const grabHash = (log: string, label: string) =>
    log.match(new RegExp(`${label}\\s+(0x[0-9a-fA-F]{64})`))?.[1];

  it("verifies a queued transaction by nonce and by hash", async () => {
    serviceState.reset();
    const { safeTxHash, nonce } = await seedQueuedTx();

    const byNonce = await run(`load safe\nsafe:verify ${safe} ${nonce}`);
    const log = byNonce.logs.find((l) => l.includes("safeTxHash:"))!;

    const domainSeparator = await client.readContract({
      address: safe,
      abi: safeAbi,
      functionName: "domainSeparator",
    });
    expect(grabHash(log, "Domain hash:")).to.equal(domainSeparator);
    expect(grabHash(log, "safeTxHash:")).to.equal(safeTxHash);
    // The printed hashes recompose into the safeTxHash per EIP-712.
    expect(
      keccak256(
        concatHex([
          "0x1901",
          grabHash(log, "Domain hash:") as `0x${string}`,
          grabHash(log, "Message hash:") as `0x${string}`,
        ]),
      ),
    ).to.equal(safeTxHash);
    expect(log).to.not.include("WARNING");

    const byHash = await run(`load safe\nsafe:verify ${safe} ${safeTxHash}`);
    expect(
      grabHash(
        byHash.logs.find((l) => l.includes("safeTxHash:"))!,
        "safeTxHash:",
      ),
    ).to.equal(safeTxHash);
  });

  it("warns about untrusted delegatecalls", async () => {
    serviceState.reset();
    const { nonce } = await seedQueuedTx({ operation: 1 });

    const evm = await run(`load safe\nsafe:verify ${safe} ${nonce}`);
    expect(evm.logs.join("\n")).to.include("DELEGATECALL");
    expect(evm.logs.join("\n")).to.include("WARNING");
  });

  it("rejects service data that does not hash to the reported safeTxHash", async () => {
    serviceState.reset();
    // Store the tx under the hash of a *different* payload, as a tampered
    // service would.
    const honest = encodeFunctionData({
      abi: safeAbi,
      functionName: "changeThreshold",
      args: [2n],
    });
    const nonce = await client.readContract({
      address: safe,
      abi: safeAbi,
      functionName: "nonce",
    });
    const honestHash = await client.readContract({
      address: safe,
      abi: safeAbi,
      functionName: "getTransactionHash",
      args: [safe, 0n, honest, 0, 0n, 0n, 0n, zeroAddress, zeroAddress, nonce],
    });
    await seedQueuedTx(
      {
        data: encodeFunctionData({
          abi: safeAbi,
          functionName: "changeThreshold",
          args: [3n],
        }),
      },
      honestHash,
    );

    const verifyError = await run(
      `load safe\nsafe:verify ${safe} ${nonce}`,
    ).then(
      () => null,
      (err) => err,
    );
    expect(String(verifyError?.message)).to.include("safeTxHash mismatch");

    const execError = await run(
      `load safe\nsafe:execute ${safe} ${honestHash}`,
    ).then(
      () => null,
      (err) => err,
    );
    expect(String(execError?.message)).to.include(
      "refusing to execute possibly tampered data",
    );
  });

  it("prints the nested Safe approveHash transaction hashes", async () => {
    serviceState.reset();

    // A second Safe that acts as a signer of the first one.
    const deployer = await run(
      `load safe\nsafe:new ${ownerB} --salt ${deploySalt + 1n}`,
    );
    const nestedSafe = deployer.logs
      .find((l) => l.includes("Deploying new Safe at"))!
      .match(/0x[0-9a-fA-F]{40}/)![0] as Address;

    const { safeTxHash, nonce } = await seedQueuedTx();
    const evm = await run(
      `load safe\nsafe:verify ${safe} ${nonce} --nested-safe ${nestedSafe}`,
    );

    const nestedLog = evm.logs.find((l) =>
      l.includes("Nested Safe approveHash transaction"),
    )!;
    const expectedNestedHash = await client.readContract({
      address: nestedSafe,
      abi: safeAbi,
      functionName: "getTransactionHash",
      args: [
        safe,
        0n,
        encodeFunctionData({
          abi: safeAbi,
          functionName: "approveHash",
          args: [safeTxHash],
        }),
        0,
        0n,
        0n,
        0n,
        zeroAddress,
        zeroAddress,
        0n,
      ],
    });
    expect(grabHash(nestedLog, "safeTxHash:")).to.equal(expectedNestedHash);
  });

  it("computes off-chain Safe message hashes matching the fallback handler", async () => {
    const evm = await run(
      `load safe\nsafe:verify-message ${safe} "hello safe"`,
    );
    const onChain = await client.readContract({
      address: safe,
      abi: safeAbi,
      functionName: "getMessageHash",
      args: [hashMessage("hello safe")],
    });
    const log = evm.logs.find((l) => l.includes("SafeMessage hash:"))!;
    expect(grabHash(log, "SafeMessage hash:")).to.equal(onChain);

    const helper = await run(
      `load safe\nset $hash @safe:messageHash("hello safe" ${safe})`,
    );
    expect(helper.getBinding("$hash", BindingsSpace.USER)).to.equal(onChain);
  });

  it("rejects delegate-exec outside a propose/exec block", async () => {
    const error = await run(
      `load safe\nsafe:delegate-exec ${safe} something(uint256) 1`,
    ).then(
      () => null,
      (err) => err,
    );
    expect(String(error?.message)).to.include(
      "can only be used inside a safe:propose or safe:execute block",
    );
  });
});
