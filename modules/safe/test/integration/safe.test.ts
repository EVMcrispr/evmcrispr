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
import type { Hex, PublicClient, WalletClient } from "viem";
import {
  concatHex,
  encodeFunctionData,
  getAddress,
  getContractAddress,
  hashMessage,
  keccak256,
  parseAbi,
  sliceHex,
  toHex,
  zeroAddress,
} from "viem";
import { gnosis } from "viem/chains";
import {
  COMPATIBILITY_FALLBACK_HANDLER,
  DELAY_MASTERCOPIES,
  SAFE_L2_SINGLETON,
  SAFE_PROXY_FACTORY,
} from "../../src/addresses";
import type { SafeTx } from "../../src/utils";
import {
  encodeSetUp,
  getSafeTxHashes,
  getSafeTxTypedData,
  pickDeployedMastercopy,
  predictZodiacModuleAddress,
} from "../../src/utils";
import { safeInitializer } from "../../src/utils/deployment";
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
        const from = action.from ?? account ?? ownerA;
        const wallet = wallets.find(
          (w) => w.account!.address.toLowerCase() === from.toLowerCase(),
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
        if (typedData.primaryType === "SafeMessage")
          return (wallet.account as any).signTypedData({
            domain: {
              chainId: BigInt(typedData.domain.chainId),
              verifyingContract: typedData.domain.verifyingContract,
            },
            types: { SafeMessage: typedData.types.SafeMessage },
            primaryType: "SafeMessage",
            message: m,
          });
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

  // Real v1.4.1 Safes from the canonical v1.4.1 factory on the fork.
  const factory141: Address = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
  const l2Singleton141: Address = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
  const handler141: Address = "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99";
  const createAbi = parseAbi([
    "function createProxyWithNonce(address,bytes,uint256) returns (address)",
  ]);
  const deploy141 = async (handler: Address, salt: bigint) => {
    const args = [
      l2Singleton141,
      safeInitializer([ownerA], 1n, handler),
      salt,
    ] as const;
    const { result } = await client.simulateContract({
      address: factory141,
      abi: createAbi,
      functionName: "createProxyWithNonce",
      args,
      account: ownerA,
    });
    await client.waitForTransactionReceipt({
      hash: await wallets[0].writeContract({
        address: factory141,
        abi: createAbi,
        functionName: "createProxyWithNonce",
        args,
        account: wallets[0].account!,
        chain: gnosis,
      }),
    });
    return result;
  };

  beforeAll(() => {
    client = getPublicClient();
    wallets = getWalletClients();
    [ownerA, ownerB, ownerC, ownerD] = wallets.map(
      (w) => w.account!.address,
    ) as Address[];
  });

  it("deploys a new Safe at a deterministic address", async () => {
    // Predict the address independently from the command's implementation:
    // the plain singleton with a SafeToL2Setup delegatecall, as Safe{Wallet}
    // creates Safes (canonical v1.5.0 addresses from safe-deployments).
    const plainSingleton: Address =
      "0xFf51A5898e281Db6DfC7855790607438dF2ca44b";
    const toL2Setup: Address = "0x900C7589200010D6C6eCaaE5B06EBe653bc2D82a";
    const initializer = encodeFunctionData({
      abi: safeAbi,
      functionName: "setup",
      args: [
        [ownerA],
        1n,
        toL2Setup,
        encodeFunctionData({
          abi: parseAbi(["function setupToL2(address l2Singleton)"]),
          args: [SAFE_L2_SINGLETON],
        }),
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
        toHex(BigInt(plainSingleton), { size: 32 }),
      ]),
    });

    await run(`load safe\nsafe:new ${ownerA} --salt ${deploySalt}`);

    expect(await client.getCode({ address: safe })).to.not.be.undefined;
    expect(await getOwners()).to.eql([ownerA]);
    expect(await getThreshold()).to.equal(1n);
    // Gnosis is not chain 1, so SafeToL2Setup moved it to the L2 singleton.
    expect(
      getAddress(
        sliceHex(
          (await client.getStorageAt({
            address: safe,
            slot: toHex(0n, { size: 32 }),
          })) as Hex,
          12,
          32,
        ),
      ),
    ).to.equal(SAFE_L2_SINGLETON);
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
    expect(String(execError?.message)).to.include(
      "safe:confirm or safe:confirm-offline",
    );

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

  const verify = async (target: string, extra = "") => {
    const evm = await run(
      `load safe\nset $r @safe:verify(${safe} ${target}${extra})`,
    );
    return JSON.parse(evm.getBinding("$r", BindingsSpace.USER) as string);
  };

  it("verifies a queued transaction by nonce and by hash", async () => {
    serviceState.reset();
    const { safeTxHash, nonce } = await seedQueuedTx();

    const byNonce = await verify(String(nonce));
    const domainSeparator = await client.readContract({
      address: safe,
      abi: safeAbi,
      functionName: "domainSeparator",
    });
    expect(byNonce.hashes.domainHash).to.equal(domainSeparator);
    expect(byNonce.hashes.safeTxHash).to.equal(safeTxHash);
    // The reported hashes recompose into the safeTxHash per EIP-712.
    expect(
      keccak256(
        concatHex([
          "0x1901",
          byNonce.hashes.domainHash,
          byNonce.hashes.messageHash,
        ]),
      ),
    ).to.equal(safeTxHash);
    expect(byNonce.warnings).to.eql([]);
    expect(byNonce.competing).to.eql([]);

    const byHash = await verify(safeTxHash);
    expect(byHash.hashes.safeTxHash).to.equal(safeTxHash);
  });

  it("warns about other trusted transactions queued at the same nonce", async () => {
    serviceState.reset();
    const { safeTxHash, nonce } = await seedQueuedTx();
    const threshold = (n: bigint) =>
      encodeFunctionData({
        abi: safeAbi,
        functionName: "changeThreshold",
        args: [n],
      });
    const { safeTxHash: rival } = await seedQueuedTx({ data: threshold(1n) });
    const { safeTxHash: spam } = await seedQueuedTx({ data: threshold(3n) });
    // Anyone can push an unsigned proposal: it must not count.
    serviceState.transactions.get(spam.toLowerCase()).trusted = false;

    const report = await verify(safeTxHash);
    expect(report.competing).to.eql([rival]);
    // A nonce names one transaction; with rivals queued it is ambiguous.
    const ambiguous = await verify(String(nonce)).then(
      () => null,
      (err) => err,
    );
    expect(String(ambiguous?.message)).to.include(
      `2 transactions are queued at nonce ${nonce}`,
    );
    expect(String(ambiguous?.message)).to.include(rival);

    // Proposing over an occupied nonce says what it competes with.
    const proposed = (
      await run(
        `load safe\nsafe:propose ${safe} (\n  exec ${safe} changeThreshold(uint256) 1\n) --nonce ${nonce}`,
      )
    ).logs.join("\n");
    expect(proposed).to.include(`queued at nonce ${nonce}`);
    expect(proposed).to.include(safeTxHash);
  });

  it("warns about untrusted delegatecalls", async () => {
    serviceState.reset();
    const { nonce } = await seedQueuedTx({ operation: 1 });

    const report = await verify(String(nonce));
    expect(report.warnings.join("\n")).to.include("DELEGATECALL");
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

    const verifyError = await verify(String(nonce)).then(
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
    expect(String(execError?.message)).to.include("safeTxHash mismatch");
  });

  it("collects portable owner signatures and executes a two-owner Safe without the service", async () => {
    serviceState.reset();
    const deployed = await run(
      `load safe\nsafe:new ${ownerA} ${ownerB} --threshold 2 --salt ${deploySalt + 2n}`,
    );
    const localSafe = deployed.logs
      .find((l) => l.includes("Deploying new Safe at"))!
      .match(/0x[0-9a-fA-F]{40}/)![0] as Address;
    const jsonFrom = (result: { logs: string[] }) =>
      result.logs.find((l) => l.startsWith('{"chainId"'))!;
    const prepared = jsonFrom(
      await run(
        `load safe\nsafe:propose-offline $tx ${localSafe} (\n  safe:change-threshold 1\n)`,
        ownerC,
      ),
    );
    const first = jsonFrom(
      await run(
        `load safe\nsafe:confirm-offline $tx ${localSafe} ${JSON.stringify(prepared)}`,
        ownerA,
      ),
    );
    const second = jsonFrom(
      await run(
        `load safe\nsafe:confirm-offline $tx ${localSafe} ${JSON.stringify(first)}`,
        ownerB,
      ),
    );
    const exported = JSON.parse(second);
    const tx = exported.tx;
    const onChainHash = await client.readContract({
      address: localSafe,
      abi: safeAbi,
      functionName: "getTransactionHash",
      args: [
        tx.to,
        BigInt(tx.value),
        tx.data,
        tx.operation,
        BigInt(tx.safeTxGas),
        BigInt(tx.baseGas),
        BigInt(tx.gasPrice),
        tx.gasToken,
        tx.refundReceiver,
        BigInt(tx.nonce),
      ],
    });
    expect(exported.safeTxHash).to.equal(onChainHash);
    const verified = await run(
      `load safe\nset $r @safe:verify(${localSafe} ${JSON.stringify(second)})`,
    );
    const report = JSON.parse(
      verified.getBinding("$r", BindingsSpace.USER) as string,
    );
    expect(report.hashes.safeTxHash).to.equal(onChainHash);
    expect(report.readiness).to.equal("ready");
    expect(serviceState.proposals).to.have.lengthOf(0);
    // Anyone can post locally signed JSON to the queue: the first owner
    // signature proposes, the rest become confirmations — no wallet prompt.
    await run(
      `load safe\nsafe:propose ${localSafe} ${JSON.stringify(second)}`,
      ownerD,
    );
    expect(serviceState.proposals).to.have.length(1);
    expect(serviceState.proposals[0].contractTransactionHash).to.equal(
      onChainHash,
    );
    expect([ownerA, ownerB]).to.include(serviceState.proposals[0].sender);
    expect(serviceState.confirmations).to.eql([
      {
        safeTxHash: onChainHash.toLowerCase(),
        signature: exported.signatures.find(
          (sig: string) => sig !== serviceState.proposals[0].signature,
        ),
      },
    ]);
    await run(`load safe\nsafe:execute ${localSafe} ${JSON.stringify(second)}`);
    expect(
      await client.readContract({
        address: localSafe,
        abi: safeAbi,
        functionName: "getThreshold",
      }),
    ).to.equal(1n);
    expect(
      await client.readContract({
        address: localSafe,
        abi: safeAbi,
        functionName: "nonce",
      }),
    ).to.equal(1n);
    // Execution never touched the service: only the explicit propose did.
    expect(serviceState.proposals).to.have.lengthOf(1);
  });

  const deployTwoOfTwo = async (salt: bigint) => {
    const deployed = await run(
      `load safe\nsafe:new ${ownerA} ${ownerB} --threshold 2 --salt ${salt}`,
    );
    return deployed.logs
      .find((l) => l.includes("Deploying new Safe at"))!
      .match(/0x[0-9a-fA-F]{40}/)![0] as Address;
  };
  const thresholdOf = (address: Address) =>
    client.readContract({
      address,
      abi: safeAbi,
      functionName: "getThreshold",
    });

  it("lets the executing owner complete the last confirmation of a queued transaction", async () => {
    serviceState.reset();
    const localSafe = await deployTwoOfTwo(deploySalt + 3n);
    const tx: SafeTx = {
      to: localSafe,
      value: 0n,
      data: encodeFunctionData({
        abi: safeAbi,
        functionName: "changeThreshold",
        args: [1n],
      }),
      operation: 0,
      safeTxGas: 0n,
      baseGas: 0n,
      gasPrice: 0n,
      gasToken: zeroAddress,
      refundReceiver: zeroAddress,
      nonce: 0n,
    };
    const typedData = getSafeTxTypedData(gnosis.id, localSafe, tx);
    const safeTxHash = await client.readContract({
      address: localSafe,
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
        0n,
      ],
    });
    serviceState.transactions.set(safeTxHash.toLowerCase(), {
      safe: localSafe,
      to: tx.to,
      value: "0",
      data: tx.data,
      operation: 0,
      safeTxGas: "0",
      baseGas: "0",
      gasPrice: "0",
      gasToken: zeroAddress,
      refundReceiver: zeroAddress,
      nonce: "0",
      safeTxHash,
      confirmationsRequired: 2,
      isExecuted: false,
      confirmations: [
        {
          owner: ownerB,
          signature: await (wallets[1].account as any).signTypedData({
            domain: typedData.domain,
            types: { SafeTx: typedData.types.SafeTx },
            primaryType: "SafeTx",
            message: typedData.message,
          }),
        },
      ],
    });

    // A non-owner cannot fill the gap...
    const error = await run(
      `load safe\nsafe:execute ${localSafe} ${safeTxHash}`,
      ownerC,
    ).then(
      () => null,
      (err) => err,
    );
    expect(String(error?.message)).to.include(
      "1 of 2 required owner signatures",
    );

    // ...but owner A approves by sending execTransaction itself.
    await run(`load safe\nsafe:execute ${localSafe} ${safeTxHash}`, ownerA);
    expect(await thresholdOf(localSafe)).to.equal(1n);
  });

  it("flow 4: executes with on-chain confirmations only, never touching the service", async () => {
    serviceState.reset();
    const localSafe = await deployTwoOfTwo(deploySalt + 4n);
    const block = `(\n  safe:change-threshold 1\n)`;
    const prepare = `safe:propose-offline $tx ${localSafe} ${block}`;

    // Owner B confirms on-chain; a second confirmation is a no-op.
    await run(
      `load safe\n${prepare}\nsafe:confirm-onchain ${localSafe} $tx`,
      ownerB,
    );
    const again = await run(
      `load safe\n${prepare}\nsafe:confirm-onchain ${localSafe} $tx`,
      ownerB,
    );
    expect(again.logs.join("\n")).to.include("already confirmed");

    // A non-owner can neither approve nor complete the threshold.
    const notOwner = await run(
      `load safe\n${prepare}\nsafe:confirm-onchain ${localSafe} $tx`,
      ownerC,
    ).then(
      () => null,
      (err) => err,
    );
    expect(String(notOwner?.message)).to.include("is not an owner");
    const short = await run(
      `load safe\nsafe:execute ${localSafe} ${block}`,
      ownerC,
    ).then(
      () => null,
      (err) => err,
    );
    expect(String(short?.message)).to.include("1 of 2");

    // Owner A executes: B's approval plus A's own pre-validated signature.
    await run(`load safe\nsafe:execute ${localSafe} ${block}`, ownerA);
    expect(await thresholdOf(localSafe)).to.equal(1n);
    expect(serviceState.proposals).to.have.lengthOf(0);
  });

  it("flow 6: an owner Safe confirms on-chain, queued or executed directly", async () => {
    const ownerSafeLogs = await run(
      `load safe\nsafe:new ${ownerA} --salt ${deploySalt + 5n}`,
    );
    const ownerSafe = ownerSafeLogs.logs
      .find((l) => l.includes("Deploying new Safe at"))!
      .match(/0x[0-9a-fA-F]{40}/)![0] as Address;
    const parentLogs = await run(
      `load safe\nsafe:new ${ownerB} ${ownerSafe} --threshold 2 --salt ${deploySalt + 6n}`,
    );
    const parent = parentLogs.logs
      .find((l) => l.includes("Deploying new Safe at"))!
      .match(/0x[0-9a-fA-F]{40}/)![0] as Address;
    const block = `(\n  safe:change-threshold 1\n)`;

    const prepare = `safe:propose-offline $tx ${parent} ${block}`;

    // Flow 6a: the owner Safe's confirmation, queued on its own service queue.
    serviceState.reset();
    const queued = await run(
      `load safe\n${prepare}\nsafe:propose ${ownerSafe} (\n  safe:confirm-onchain ${parent} $tx\n)`,
      ownerA,
    );
    const parentTx = JSON.parse(
      queued.getBinding("$tx", BindingsSpace.USER) as string,
    );
    expect(serviceState.proposals).to.have.lengthOf(1);
    expect(serviceState.proposals[0].safe).to.equal(ownerSafe);
    expect(serviceState.proposals[0].to).to.equal(parent);
    expect(serviceState.proposals[0].data).to.equal(
      encodeFunctionData({
        abi: safeAbi,
        functionName: "approveHash",
        args: [parentTx.safeTxHash],
      }),
    );

    // Flow 6b: ownerA confirms on-chain without naming the owner Safe: the
    // 1-of-1 owner Safe executes approveHash in one transaction.
    await run(
      `load safe\n${prepare}\nsafe:confirm-onchain ${parent} $tx`,
      ownerA,
    );
    await run(`load safe\nsafe:execute ${parent} ${block}`, ownerB);
    expect(await thresholdOf(parent)).to.equal(1n);
  });

  it("flow 2/5/9: confirms on the service, exports to JSON, and cancels", async () => {
    serviceState.reset();
    const localSafe = await deployTwoOfTwo(deploySalt + 7n);
    const tx: SafeTx = {
      to: localSafe,
      value: 0n,
      data: encodeFunctionData({
        abi: safeAbi,
        functionName: "changeThreshold",
        args: [1n],
      }),
      operation: 0,
      safeTxGas: 0n,
      baseGas: 0n,
      gasPrice: 0n,
      gasToken: zeroAddress,
      refundReceiver: zeroAddress,
      nonce: 0n,
    };
    const safeTxHash = getSafeTxHashes(gnosis.id, localSafe, tx).safeTxHash;
    const queued = {
      safe: localSafe,
      to: tx.to,
      value: "0",
      data: tx.data,
      operation: 0,
      safeTxGas: "0",
      baseGas: "0",
      gasPrice: "0",
      gasToken: zeroAddress,
      refundReceiver: zeroAddress,
      nonce: "0",
      safeTxHash,
      confirmationsRequired: 2,
      isExecuted: false,
      confirmations: [] as { owner: Address; signature: string }[],
    };
    serviceState.transactions.set(safeTxHash.toLowerCase(), queued);

    // Flow 2: owner B confirms on the service.
    await run(`load safe\nsafe:confirm ${localSafe} ${safeTxHash}`, ownerB);
    expect(serviceState.confirmations).to.have.lengthOf(1);
    queued.confirmations.push({
      owner: ownerB,
      signature: serviceState.confirmations[0].signature,
    });
    const again = await run(
      `load safe\nsafe:confirm ${localSafe} ${safeTxHash}`,
      ownerB,
    );
    expect(again.logs.join("\n")).to.include("already confirmed");
    const notOwner = await run(
      `load safe\nsafe:confirm ${localSafe} ${safeTxHash}`,
      ownerC,
    ).then(
      () => null,
      (err) => err,
    );
    expect(String(notOwner?.message)).to.include("is not an owner");

    // Flow 9: a rejection at the same nonce lists what it competes with.
    const cancelled = await run(
      `load safe\nsafe:propose ${localSafe} cancel --nonce 0`,
      ownerA,
    );
    expect(cancelled.logs.join("\n")).to.include(safeTxHash);
    expect(serviceState.proposals).to.have.lengthOf(1);
    expect(serviceState.proposals[0]).to.include({
      to: localSafe,
      value: "0",
      data: null,
      nonce: "0",
    });

    // Flow 5: owner A exports the queued transaction with B's confirmation
    // plus its own signature, and anyone executes the JSON.
    const exported = await run(
      `load safe\nsafe:confirm-offline $tx ${localSafe} ${safeTxHash}\nsafe:execute ${localSafe} $tx`,
      ownerA,
    );
    expect(
      JSON.parse(exported.getBinding("$tx", BindingsSpace.USER) as string)
        .signatures,
    ).to.have.lengthOf(2);
    expect(await thresholdOf(localSafe)).to.equal(1n);
  });

  it("flow 8: signs a Safe message on the service and checks it on-chain", async () => {
    serviceState.reset();
    const localSafe = await deployTwoOfTwo(deploySalt + 8n);
    await run(`load safe\nsafe:propose ${localSafe} "hello safe"`, ownerA);
    expect(serviceState.messageProposals).to.have.lengthOf(1);
    const proposal = serviceState.messageProposals[0];
    expect(proposal.message).to.equal("hello safe");

    const messageHash = await client.readContract({
      address: localSafe,
      abi: safeAbi,
      functionName: "getMessageHash",
      args: [hashMessage("hello safe")],
    });
    const stored = {
      safe: localSafe,
      messageHash,
      message: "hello safe",
      confirmations: [{ owner: ownerA, signature: proposal.signature }],
    };
    serviceState.messages.set(messageHash.toLowerCase(), stored);

    // Without --message a hash is a safeTxHash.
    const asTx = await run(
      `load safe\nsafe:confirm ${localSafe} ${messageHash}`,
      ownerB,
    ).then(
      () => null,
      (err) => err,
    );
    expect(String(asTx?.message)).to.include("not found");

    await run(
      `load safe\nsafe:confirm ${localSafe} ${messageHash} --message true`,
      ownerB,
    );
    expect(serviceState.messageSignatures).to.have.lengthOf(1);
    stored.confirmations.push({
      owner: ownerB,
      signature: serviceState.messageSignatures[0].signature,
    });

    const evm = await run(
      `load safe\nset $sig @safe:signature(${localSafe} ${messageHash} message:true)`,
    );
    const signature = evm.getBinding("$sig", BindingsSpace.USER) as Hex;
    // The Safe's fallback handler accepts it as an EIP-1271 signature.
    expect(
      await client.readContract({
        address: localSafe,
        abi: parseAbi([
          "function isValidSignature(bytes32,bytes) view returns (bytes4)",
        ]),
        functionName: "isValidSignature",
        args: [hashMessage("hello safe"), signature],
      }),
    ).to.equal("0x1626ba7e");

    // Service content that does not hash to the requested hash is refused.
    stored.message = "goodbye safe";
    const tampered = await run(
      `load safe\nsafe:confirm ${localSafe} ${messageHash} --message true`,
      ownerB,
    ).then(
      () => null,
      (err) => err,
    );
    expect(String(tampered?.message)).to.include("safeMessageHash mismatch");
  });

  // An owner Safe B (owned by ownerA) and a 2-of-2 parent owned by B and
  // ownerB; B needs `bThreshold` signatures (ownerA, plus ownerC when 2).
  const deployNested = async (salt: bigint, bThreshold = 1n) => {
    const bOwners = bThreshold === 1n ? `${ownerA}` : `${ownerA} ${ownerC}`;
    const b = (
      await run(
        `load safe\nsafe:new ${bOwners} --threshold ${bThreshold} --salt ${salt}`,
      )
    ).logs
      .find((l) => l.includes("Deploying new Safe at"))!
      .match(/0x[0-9a-fA-F]{40}/)![0] as Address;
    const parent = (
      await run(
        `load safe\nsafe:new ${b} ${ownerB} --threshold 2 --salt ${salt + 100n}`,
      )
    ).logs
      .find((l) => l.includes("Deploying new Safe at"))!
      .match(/0x[0-9a-fA-F]{40}/)![0] as Address;
    return { b, parent };
  };

  it("flow 6: an owner of an owner Safe signs offline with the same commands", async () => {
    serviceState.reset();
    const { b, parent } = await deployNested(deploySalt + 9n);
    const block = `(\n  safe:change-threshold 1\n)`;
    const script = [
      "load safe",
      `safe:propose-offline $tx ${parent} ${block}`,
      `safe:confirm-offline $tx ${parent} $tx`,
    ].join("\n");
    // ownerA does not own the parent: it signs through owner Safe B.
    const viaB = await run(script, ownerA);
    const tx = viaB.getBinding("$tx", BindingsSpace.USER) as string;
    expect(JSON.parse(tx).signatures[0]).to.include({ owner: b });
    const report = JSON.parse(
      (
        await run(
          `load safe\nset $r @safe:verify(${parent} ${JSON.stringify(tx)})`,
        )
      ).getBinding("$r", BindingsSpace.USER) as string,
    );
    // The parent's own EIP-1271 check accepts B's signature.
    expect(report.signatures).to.deep.include({
      owner: b,
      type: "contract",
      status: "valid",
      progress: "1 of 1",
    });
    await run(
      `load safe\nsafe:confirm-offline $tx ${parent} ${JSON.stringify(tx)}\nsafe:execute ${parent} $tx`,
      ownerB,
    );
    expect(await thresholdOf(parent)).to.equal(1n);
    expect(serviceState.proposals).to.have.lengthOf(0);
  });

  it("flow 6: confirms a queued transaction through an owner Safe on the service", async () => {
    serviceState.reset();
    const { b, parent } = await deployNested(deploySalt + 10n);
    const tx: SafeTx = {
      to: parent,
      value: 0n,
      data: encodeFunctionData({
        abi: safeAbi,
        functionName: "changeThreshold",
        args: [1n],
      }),
      operation: 0,
      safeTxGas: 0n,
      baseGas: 0n,
      gasPrice: 0n,
      gasToken: zeroAddress,
      refundReceiver: zeroAddress,
      nonce: 0n,
    };
    const safeTxHash = getSafeTxHashes(gnosis.id, parent, tx).safeTxHash;
    const queued = {
      safe: parent,
      to: tx.to,
      value: "0",
      data: tx.data,
      operation: 0,
      safeTxGas: "0",
      baseGas: "0",
      gasPrice: "0",
      gasToken: zeroAddress,
      refundReceiver: zeroAddress,
      nonce: "0",
      safeTxHash,
      confirmationsRequired: 2,
      isExecuted: false,
      confirmations: [] as { owner: Address; signature: string }[],
    };
    serviceState.transactions.set(safeTxHash.toLowerCase(), queued);

    // B needs only ownerA: an off-chain contract signature, no gas.
    await run(`load safe\nsafe:confirm ${parent} ${safeTxHash}`, ownerA);
    expect(serviceState.confirmations).to.have.lengthOf(1);
    expect(serviceState.proposals).to.have.lengthOf(0);
    queued.confirmations.push({
      owner: b,
      signature: serviceState.confirmations[0].signature,
    });
    const again = await run(
      `load safe\nsafe:confirm ${parent} ${safeTxHash}`,
      ownerA,
    );
    expect(again.logs.join("\n")).to.include("already confirmed");

    // ownerB executes: B's contract signature plus its own approval.
    await run(`load safe\nsafe:execute ${parent} ${safeTxHash}`, ownerB);
    expect(await thresholdOf(parent)).to.equal(1n);
  });

  it("flow 6: queues an owner Safe's on-chain confirmation when it needs more signatures", async () => {
    serviceState.reset();
    const { b, parent } = await deployNested(deploySalt + 11n, 2n);
    const prepared = (
      await run(
        `load safe\nsafe:propose-offline $tx ${parent} (\n  safe:change-threshold 1\n)`,
      )
    ).getBinding("$tx", BindingsSpace.USER) as string;
    const { safeTxHash } = JSON.parse(prepared);
    // The parent transaction is queued on the service, unconfirmed.
    const { tx } = JSON.parse(prepared);
    serviceState.transactions.set(safeTxHash.toLowerCase(), {
      ...tx,
      safe: parent,
      safeTxHash,
      confirmationsRequired: 2,
      isExecuted: false,
      confirmations: [],
    });

    // B needs ownerA and ownerC: ownerA proposes B's approveHash in B's queue.
    const confirmed = await run(
      `load safe\nsafe:confirm ${parent} ${safeTxHash}`,
      ownerA,
    );
    expect(confirmed.logs.join("\n")).to.include(`Owner Safe ${b} needs 2`);
    expect(serviceState.proposals).to.have.lengthOf(1);
    expect(serviceState.proposals[0]).to.include({ safe: b, to: parent });
    expect(serviceState.proposals[0].data).to.equal(
      encodeFunctionData({
        abi: safeAbi,
        functionName: "approveHash",
        args: [safeTxHash],
      }),
    );
    const onchain = await run(
      `load safe\nsafe:confirm-onchain ${parent} ${safeTxHash}`,
      ownerA,
    ).then(
      () => null,
      (err) => err,
    );
    expect(String(onchain?.message)).to.include(
      "needs more signatures than yours",
    );
  });

  it("upgrades a v1.4.1 Safe to v1.5.0 through SafeMigration", async () => {
    const slot = async (address: Address, s: Hex) =>
      getAddress(
        sliceHex(
          (await client.getStorageAt({ address, slot: s })) as Hex,
          12,
          32,
        ),
      );
    const handlerSlot = keccak256(toHex("fallback_manager.handler.address"));
    const version = (address: Address) =>
      client.readContract({
        address,
        abi: parseAbi(["function VERSION() view returns (string)"]),
        functionName: "VERSION",
      });

    const official = await deploy141(handler141, deploySalt + 12n);
    expect(await version(official)).to.equal("1.4.1");
    const upgraded = await run(
      `load safe\nsafe:execute ${official} (\n  safe:upgrade\n)`,
      ownerA,
    );
    expect(upgraded.logs.join("\n")).to.include("migrateL2WithFallbackHandler");
    expect(await version(official)).to.equal("1.5.0");
    expect(await slot(official, toHex(0n, { size: 32 }))).to.equal(
      SAFE_L2_SINGLETON,
    );
    expect(await slot(official, handlerSlot)).to.equal(
      COMPATIBILITY_FALLBACK_HANDLER,
    );
    // The upgraded Safe keeps working, and a second upgrade is a no-op.
    await run(
      `load safe\nsafe:execute ${official} (\n  safe:add-owner ${ownerB} --threshold 1\n)`,
      ownerA,
    );
    const again = await run(
      `load safe\nsafe:execute ${official} (\n  safe:upgrade\n)`,
      ownerA,
    );
    expect(again.logs.join("\n")).to.include("already on v1.5.0");

    // A custom fallback handler is the owners' choice and stays.
    const customHandler: Address = "0x000000000000000000000000000000000000dEaD";
    const custom = await deploy141(customHandler, deploySalt + 13n);
    const kept = await run(
      `load safe\nsafe:execute ${custom} (\n  safe:upgrade\n)`,
      ownerA,
    );
    expect(kept.logs.join("\n")).to.include("migrateL2Singleton");
    expect(await version(custom)).to.equal("1.5.0");
    expect(await slot(custom, handlerSlot)).to.equal(customHandler);
  });

  describe("module guards", () => {
    // Literal on purpose: keccak256("module_manager.module_guard.address"),
    // not re-derived from the code under test.
    const moduleGuardSlot: Hex =
      "0xb104e0b93118902c651344349b610029d694cfdec91c589c91ebafbcd0289947";
    const guardSlot: Hex =
      "0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8";
    // Mock guards: supportsInterface answers true for one interface id only
    // (CALLDATALOAD(4) >> 224 == id), which is all setGuard/setModuleGuard
    // check. No module ever executes through them in these tests.
    const mockGuard = (id: string) =>
      `0x600435${"60e01c"}63${id}14600052${"60206000f3"}` as Hex;
    const moduleGuardMock: Address =
      "0x0000000000000000000000000000000000001001";
    const txGuardMock: Address = "0x0000000000000000000000000000000000001002";
    const readSlot = async (address: Address, s: Hex) =>
      getAddress(
        sliceHex(
          ((await client.getStorageAt({ address, slot: s })) ??
            toHex(0n, { size: 32 })) as Hex,
          12,
          32,
        ),
      );
    const fails = (promise: Promise<unknown>) =>
      promise.then(
        () => null,
        (err) => String(err?.message),
      );
    let safe15: Address;

    beforeAll(async () => {
      for (const [address, id] of [
        [moduleGuardMock, "58401ed8"],
        [txGuardMock, "e6d7a83a"],
      ] as const)
        await client.request({
          method: "anvil_setCode",
          params: [address, mockGuard(id)],
        } as never);
    });

    it("reads the module guard slot, not the transaction guard slot", async () => {
      await run(`load safe\nsafe:new ${ownerA} --salt ${deploySalt + 20n}`);
      safe15 = getAddress(
        (
          await run(
            `load safe\nset $s @safe:address(${ownerA} ${deploySalt + 20n})`,
          )
        ).getBinding("$s", BindingsSpace.USER) as Address,
      );
      const marker: Address = "0x000000000000000000000000000000000000bEEF";
      await client.request({
        method: "anvil_setStorageAt",
        params: [safe15, moduleGuardSlot, toHex(BigInt(marker), { size: 32 })],
      } as never);
      const evm = await run(
        [
          "load safe",
          `set $module @safe:guard(${safe15} module:true)`,
          `set $tx @safe:guard(${safe15})`,
        ].join("\n"),
      );
      const { USER } = BindingsSpace;
      expect(evm.getBinding("$module", USER)).to.equal(marker);
      expect(evm.getBinding("$tx", USER)).to.equal(zeroAddress);
      await client.request({
        method: "anvil_setStorageAt",
        params: [safe15, moduleGuardSlot, toHex(0n, { size: 32 })],
      } as never);
    });

    it("sets and removes the module guard of a v1.5.0 Safe", async () => {
      // The Safe would refuse these with GS301/GS300; the command refuses
      // them first, and points a module guard used as a transaction guard
      // at --module.
      expect(
        await fails(
          run(
            `load safe\nsafe:execute ${safe15} (\n  safe:set-guard ${txGuardMock} --module true\n)`,
          ),
        ),
      ).to.include("is not a module guard");
      expect(
        await fails(
          run(
            `load safe\nsafe:execute ${safe15} (\n  safe:set-guard ${moduleGuardMock}\n)`,
          ),
        ),
      ).to.include("It is a module guard: pass --module");

      await run(
        `load safe\nsafe:execute ${safe15} (\n  safe:set-guard ${moduleGuardMock} --module true\n)`,
      );
      expect(await readSlot(safe15, moduleGuardSlot)).to.equal(moduleGuardMock);
      expect(await readSlot(safe15, guardSlot)).to.equal(zeroAddress);

      await run(
        `load safe\nsafe:execute ${safe15} (\n  safe:remove-guard --module true\n)`,
      );
      expect(await readSlot(safe15, moduleGuardSlot)).to.equal(zeroAddress);
    });

    it("refuses --module below v1.5.0 unless the block upgrades the Safe first", async () => {
      const legacy = await deploy141(handler141, deploySalt + 21n);
      expect(
        await fails(
          run(
            `load safe\nsafe:execute ${legacy} (\n  safe:set-guard ${moduleGuardMock} --module true\n)`,
          ),
        ),
      ).to.include("needs Safe v1.5.0 or later");

      // The upgrade is only recorded for its own block: a later block that
      // has not run yet still sees the old version.
      serviceState.reset();
      expect(
        await fails(
          run(
            [
              "load safe",
              `safe:propose ${legacy} (\n  safe:upgrade\n)`,
              `safe:propose ${legacy} (\n  safe:set-guard ${moduleGuardMock} --module true\n)`,
            ].join("\n"),
          ),
        ),
      ).to.include("needs Safe v1.5.0 or later");
      expect(serviceState.proposals.length).to.equal(1);

      const upgraded = await run(
        `load safe\nsafe:execute ${legacy} (\n  safe:upgrade\n  safe:set-guard ${moduleGuardMock} --module true\n)`,
      );
      expect(upgraded.logs.join("\n")).to.include(
        "the safe:upgrade earlier in this block moves it to v1.5.0",
      );
      expect(await readSlot(legacy, moduleGuardSlot)).to.equal(moduleGuardMock);
    });
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
