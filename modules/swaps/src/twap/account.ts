import {
  buildSafeTx,
  encodeExecTransaction,
  encodeSafeDeployment,
  predictSafeAddress,
  preValidatedSignature,
  safeDeployment,
  safeFactoryAbi,
  safeInitializer,
} from "@evmcrispr/module-safe/transactions";
import type { Module, TransactionAction } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import type { Address, Block, Hex, PublicClient } from "viem";
import {
  decodeAbiParameters,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  isAddressEqual,
  keccak256,
  parseAbi,
  parseAbiParameters,
  sliceHex,
  stringToHex,
  zeroAddress,
  zeroHash,
} from "viem";
import type Swaps from "..";
import { COW_VAULT_RELAYER } from "../venues/lib/cowApi";
import {
  COMPOSABLE_COW,
  COW_FALLBACK,
  cowAbi,
  decodeSchedule,
  orderHash,
  readOrderState,
  requireCode,
  TIMESTAMP_FACTORY,
} from "./cow";
import { birthBlock, pagedLogs } from "./logs";
import type { ConditionalOrderParams, TwapReference } from "./types";

// Safe v1.4.1 SafeProxy runtime, from @safe-global/safe-contracts' artifact.
const PROXY_RUNTIME: Hex =
  "0x608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41e58e888a9865554c535f2c77126a82cb4c0f917f31441364736f6c63430007060033";
const SENTINEL = "0x0000000000000000000000000000000000000001";
const FALLBACK_SLOT = keccak256(
  stringToHex("fallback_manager.handler.address"),
);
const GUARD_SLOT = keccak256(stringToHex("guard_manager.guard.address"));
const ACCOUNT_NAMESPACE = keccak256(
  stringToHex("evmcrispr:swaps:twap-safe:v1"),
);
const MAX_ACCOUNT_SLOTS = 32;

export const accountAbi = parseAbi([
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function getModulesPaginated(address start, uint256 pageSize) view returns (address[] array, address next)",
  "function nonce() view returns (uint256)",
  "function setDomainVerifier(bytes32 domainSeparator, address verifier)",
  "function domainVerifiers(address safe, bytes32 domainSeparator) view returns (address)",
  "event SafeMultiSigTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures, bytes additionalInfo)",
]);
const multiSendAbi = parseAbi(["function multiSend(bytes transactions)"]);

export interface AccountPlan {
  account: Address;
  slot: number;
  nonce: bigint;
  deploy: TransactionAction[];
  configure: TransactionAction[];
}

export function accountSalt(
  chainId: number,
  controller: Address,
  slot: number,
): bigint {
  return BigInt(
    keccak256(
      encodeAbiParameters(
        parseAbiParameters("bytes32, uint256, address, uint256"),
        [ACCOUNT_NAMESPACE, BigInt(chainId), controller, BigInt(slot)],
      ),
    ),
  );
}

async function prediction(module: Module, controller: Address, slot: number) {
  const deployment = safeDeployment(await module.getChainId());
  const client = await module.getClient();
  const initializer = safeInitializer([controller], 1n, COW_FALLBACK);
  const creationCode = await client.readContract({
    address: deployment.proxyFactory,
    abi: safeFactoryAbi,
    functionName: "proxyCreationCode",
  });
  const salt = accountSalt(await module.getChainId(), controller, slot);
  return {
    deployment,
    initializer,
    salt,
    address: predictSafeAddress(deployment, creationCode, initializer, salt),
  };
}

const storageAddress = (value: Hex | undefined): Address =>
  getAddress(sliceHex(value ?? zeroHash, 12));

/** The storage and calls are read at one block, not a mix of chain heads. */
export async function inspectAccount(
  client: PublicClient,
  account: Address,
  controller: Address,
  chainId: number,
  blockNumber: bigint,
) {
  const deployment = safeDeployment(chainId);
  const [
    code,
    singleton,
    fallback,
    guard,
    owners,
    threshold,
    modules,
    nonce,
    domain,
    root,
    swapGuard,
  ] = await Promise.all([
    client.getCode({ address: account, blockNumber }),
    client.getStorageAt({ address: account, slot: zeroHash, blockNumber }),
    client.getStorageAt({ address: account, slot: FALLBACK_SLOT, blockNumber }),
    client.getStorageAt({ address: account, slot: GUARD_SLOT, blockNumber }),
    client.readContract({
      address: account,
      abi: accountAbi,
      functionName: "getOwners",
      blockNumber,
    }),
    client.readContract({
      address: account,
      abi: accountAbi,
      functionName: "getThreshold",
      blockNumber,
    }),
    client.readContract({
      address: account,
      abi: accountAbi,
      functionName: "getModulesPaginated",
      args: [SENTINEL, 1n],
      blockNumber,
    }),
    client.readContract({
      address: account,
      abi: accountAbi,
      functionName: "nonce",
      blockNumber,
    }),
    client.readContract({
      address: COMPOSABLE_COW,
      abi: cowAbi,
      functionName: "domainSeparator",
      blockNumber,
    }),
    client.readContract({
      address: COMPOSABLE_COW,
      abi: cowAbi,
      functionName: "roots",
      args: [account],
      blockNumber,
    }),
    client.readContract({
      address: COMPOSABLE_COW,
      abi: cowAbi,
      functionName: "swapGuards",
      args: [account],
      blockNumber,
    }),
  ]);
  const verifier = await client.readContract({
    address: COW_FALLBACK,
    abi: accountAbi,
    functionName: "domainVerifiers",
    args: [account, domain],
    blockNumber,
  });
  if (
    code?.toLowerCase() !== PROXY_RUNTIME ||
    !isAddressEqual(storageAddress(singleton), deployment.l2Singleton) ||
    !isAddressEqual(storageAddress(fallback), COW_FALLBACK) ||
    !isAddressEqual(storageAddress(guard), zeroAddress) ||
    owners.length !== 1 ||
    !isAddressEqual(owners[0], controller) ||
    threshold !== 1n ||
    modules[0].length !== 0 ||
    !isAddressEqual(modules[1], SENTINEL) ||
    root !== zeroHash ||
    !isAddressEqual(swapGuard, zeroAddress) ||
    !(
      isAddressEqual(verifier, COMPOSABLE_COW) ||
      (nonce === 0n && isAddressEqual(verifier, zeroAddress))
    )
  ) {
    throw new ErrorException("TWAP Safe configuration is incompatible");
  }
  return { nonce, domain, configure: isAddressEqual(verifier, zeroAddress) };
}

/** Decode only call-only MultiSend. Unknown delegatecalls disqualify reuse. */
export function unpackAccountCalls(
  to: Address,
  data: Hex,
  operation: number,
  chainId: number,
): TransactionAction[] {
  if (operation === 0) return [{ to, data }];
  if (
    operation !== 1 ||
    !isAddressEqual(to, safeDeployment(chainId).multiSendCallOnly)
  )
    throw new Error("Unknown Safe delegatecall");
  const decoded = decodeFunctionData({ abi: multiSendAbi, data });
  const packed = decoded.args[0];
  const result: TransactionAction[] = [];
  let offset = 0;
  const length = (packed.length - 2) / 2;
  while (offset < length) {
    if (
      offset + 85 > length ||
      BigInt(sliceHex(packed, offset, offset + 1)) !== 0n
    )
      throw new Error("Invalid MultiSend");
    const value = BigInt(sliceHex(packed, offset + 21, offset + 53));
    const dataLength = BigInt(sliceHex(packed, offset + 53, offset + 85));
    if (value !== 0n || dataLength > BigInt(length - offset - 85))
      throw new Error("Invalid MultiSend value/length");
    const end = offset + 85 + Number(dataLength);
    result.push({
      to: getAddress(sliceHex(packed, offset + 1, offset + 21)),
      data: dataLength === 0n ? "0x" : sliceHex(packed, offset + 85, end),
    });
    offset = end;
  }
  return result;
}

/** Archive access is needed to prove where history begins. If unavailable,
 * the caller skips reuse instead of assuming an empty order history. */
export async function accountHistory(
  client: PublicClient,
  account: Address,
  controller: Address,
  chainId: number,
  nonce: bigint,
  head: bigint,
) {
  if (nonce === 0n) return [];
  const fromBlock = await birthBlock(client, account, head);
  const [executionPage, creationPage] = await Promise.all([
    pagedLogs(
      (fromBlock, toBlock) =>
        client.getLogs({
          address: account,
          event: accountAbi[6],
          fromBlock,
          toBlock,
          strict: true,
        }),
      fromBlock,
      head,
    ),
    pagedLogs(
      (fromBlock, toBlock) =>
        client.getLogs({
          address: COMPOSABLE_COW,
          event: cowAbi[8],
          args: { owner: account },
          fromBlock,
          toBlock,
          strict: true,
        }),
      fromBlock,
      head,
    ),
  ]);
  if (!executionPage.complete || !creationPage.complete)
    throw new Error("Incomplete Safe execution history");
  const executions = executionPage.logs;
  const creations = creationPage.logs;
  if (BigInt(executions.length) !== nonce)
    throw new Error("Incomplete Safe execution history");
  const orders: ConditionalOrderParams[] = [];
  const tokenCalls: TransactionAction[] = [];
  const removed: Hex[] = [];
  const domain = await client.readContract({
    address: COMPOSABLE_COW,
    abi: cowAbi,
    functionName: "domainSeparator",
    blockNumber: head,
  });
  let creationIndex = 0;
  for (let i = 0; i < executions.length; i++) {
    const execution = executions[i];
    const tx = execution.args;
    const [seenNonce, sender, threshold] = decodeAbiParameters(
      parseAbiParameters("uint256, address, uint256"),
      tx.additionalInfo,
    );
    if (
      seenNonce !== BigInt(i) ||
      !isAddressEqual(sender, controller) ||
      threshold !== 1n ||
      tx.value !== 0n ||
      tx.gasPrice !== 0n ||
      tx.safeTxGas !== 0n ||
      tx.baseGas !== 0n
    )
      throw new Error("Unrecognized Safe execution");
    for (const call of unpackAccountCalls(
      tx.to,
      tx.data,
      tx.operation,
      chainId,
    )) {
      if (isAddressEqual(call.to!, COMPOSABLE_COW)) {
        const decoded = decodeFunctionData({ abi: cowAbi, data: call.data! });
        if (decoded.functionName === "remove") {
          removed.push(decoded.args[0]);
          continue;
        }
        if (
          decoded.functionName !== "create" &&
          decoded.functionName !== "createWithContext"
        )
          throw new Error("Unrecognized CoW action");
        const params = decoded.args[0];
        if (
          (decoded.functionName === "create" && !decoded.args[1]) ||
          (decoded.functionName === "createWithContext" &&
            (!decoded.args[3] ||
              !isAddressEqual(decoded.args[1], TIMESTAMP_FACTORY) ||
              decoded.args[2] !== "0x"))
        )
          throw new Error("Private or custom conditional order");
        decodeSchedule(params);
        const event = creations[creationIndex++];
        if (
          !event ||
          event.transactionHash !== execution.transactionHash ||
          orderHash(event.args.params) !== orderHash(params)
        )
          throw new Error("Incomplete conditional order history");
        if (orders.some((order) => orderHash(order) === orderHash(params)))
          throw new Error("Recreated conditional order");
        orders.push(params);
      } else if (isAddressEqual(call.to!, account)) {
        const decoded = decodeFunctionData({
          abi: accountAbi,
          data: call.data!,
        });
        if (
          decoded.functionName !== "setDomainVerifier" ||
          decoded.args[0] !== domain ||
          !isAddressEqual(decoded.args[1], COMPOSABLE_COW)
        )
          throw new Error("Unrecognized Safe self-call");
      } else tokenCalls.push(call);
    }
  }
  if (creationIndex !== creations.length)
    throw new Error("Unaccounted conditional orders");
  const tokens = new Set(
    orders.map((params) => decodeSchedule(params).sellToken.toLowerCase()),
  );
  for (const call of tokenCalls) {
    if (!tokens.has(call.to!.toLowerCase()))
      throw new Error("Unrecognized token");
    const decoded = decodeFunctionData({ abi: erc20Abi, data: call.data! });
    if (
      decoded.functionName === "approve" &&
      isAddressEqual(decoded.args[0], COW_VAULT_RELAYER)
    )
      continue;
    if (
      decoded.functionName === "transferFrom" &&
      isAddressEqual(decoded.args[0], controller) &&
      isAddressEqual(decoded.args[1], account)
    )
      continue;
    if (
      decoded.functionName === "transfer" &&
      isAddressEqual(decoded.args[0], controller)
    )
      continue;
    throw new Error("Unrecognized token action");
  }
  if (
    removed.some((hash) => !orders.some((order) => orderHash(order) === hash))
  )
    throw new Error("Unknown removed order");
  return orders;
}

export async function idleAccount(
  client: PublicClient,
  account: Address,
  history: ConditionalOrderParams[],
  block: { number: bigint; timestamp: bigint },
): Promise<void> {
  for (const params of history) {
    const state = await readOrderState(
      client,
      { account, params, orderHash: orderHash(params) },
      block.number,
    );
    if (state.registered && (state.start === 0n || block.timestamp < state.end))
      throw new Error("TWAP Safe has a live order");
    const allowance = await client.readContract({
      address: state.schedule.sellToken,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account, COW_VAULT_RELAYER],
      blockNumber: block.number,
    });
    if (allowance !== 0n)
      throw new Error(
        "TWAP Safe has an outstanding allowance; recover the previous order first",
      );
  }
}

export async function prepareAccount(
  module: Swaps,
  controller: Address,
  hash?: Hex,
): Promise<AccountPlan> {
  const client = await module.getClient();
  const chainId = await module.getChainId();
  const deployment = safeDeployment(chainId);
  await requireCode(module, [
    deployment.proxyFactory,
    deployment.l2Singleton,
    deployment.multiSendCallOnly,
  ]);
  let reserved = module.twapReservations.get(client);
  if (!reserved) {
    reserved = new Set();
    module.twapReservations.set(client, reserved);
  }
  const block = await client.getBlock();
  const domain = await client.readContract({
    address: COMPOSABLE_COW,
    abi: cowAbi,
    functionName: "domainSeparator",
    blockNumber: block.number,
  });
  for (let slot = 0; slot < MAX_ACCOUNT_SLOTS; slot++) {
    const predicted = await prediction(module, controller, slot);
    const account = predicted.address;
    if (reserved.has(account.toLowerCase())) continue;
    const code = await client.getCode({
      address: account,
      blockNumber: block.number,
    });
    let nonce = 0n;
    let configure = true;
    const deploy: TransactionAction[] = [];
    if (code && code !== "0x") {
      try {
        const health = await inspectAccount(
          client,
          account,
          controller,
          chainId,
          block.number,
        );
        const history = await accountHistory(
          client,
          account,
          controller,
          chainId,
          health.nonce,
          block.number,
        );
        await idleAccount(client, account, history, block);
        if (history.some((params) => orderHash(params) === hash)) continue;
        // Recheck after potentially slow archive/log reads, just before
        // returning actions. Proposals still require execution-time simulation.
        const latest = await client.getBlock();
        const current = await inspectAccount(
          client,
          account,
          controller,
          chainId,
          latest.number,
        );
        if (current.nonce !== health.nonce) continue;
        await idleAccount(client, account, history, latest);
        nonce = health.nonce;
        configure = health.configure;
      } catch {
        // Neither an RPC history gap nor incompatible state justifies reuse.
        continue;
      }
    } else
      deploy.push(
        encodeSafeDeployment(deployment, predicted.initializer, predicted.salt),
      );
    reserved.add(account.toLowerCase());
    return {
      account,
      slot,
      nonce,
      deploy,
      configure: configure
        ? [
            {
              to: account,
              data: encodeFunctionData({
                abi: accountAbi,
                functionName: "setDomainVerifier",
                args: [domain, COMPOSABLE_COW],
              }),
            },
          ]
        : [],
    };
  }
  throw new ErrorException(
    "No idle compatible TWAP Safe in the first 32 account slots; cancel/recover outstanding orders first",
  );
}

/** Repeat checks after quotes/valuation, before emitting funding actions. */
export async function revalidateAccount(
  module: Swaps,
  controller: Address,
  plan: AccountPlan,
  hash: Hex,
) {
  const client = await module.getClient();
  const chainId = await module.getChainId();
  const block = await client.getBlock();
  if (plan.deploy.length) {
    const code = await client.getCode({
      address: plan.account,
      blockNumber: block.number,
    });
    if (code && code !== "0x")
      throw new ErrorException(
        "TWAP account was deployed during preflight; rebuild the transaction",
      );
  } else {
    const health = await inspectAccount(
      client,
      plan.account,
      controller,
      chainId,
      block.number,
    );
    if (health.nonce !== plan.nonce)
      throw new ErrorException(
        "TWAP account changed during preflight; rebuild the transaction",
      );
    const history = await accountHistory(
      client,
      plan.account,
      controller,
      chainId,
      health.nonce,
      block.number,
    );
    await idleAccount(client, plan.account, history, block);
    if (history.some((params) => orderHash(params) === hash))
      throw new ErrorException(
        "This TWAP already used this account; choose a fresh --salt",
      );
  }
  const end = await client.getBlock({ blockNumber: block.number });
  if (end.hash !== block.hash)
    throw new ErrorException("Chain reorganized during TWAP preflight; retry");
  return block;
}

export function executeAccount(
  chainId: number,
  account: Address,
  controller: Address,
  nonce: bigint,
  calls: TransactionAction[],
): TransactionAction {
  return encodeExecTransaction(
    account,
    buildSafeTx(calls, nonce, safeDeployment(chainId)),
    preValidatedSignature(controller),
  );
}

/** References are untrusted input: never execute from an arbitrary supplied Safe. */
export async function ownedAccount(
  module: Module,
  ref: TwapReference,
): Promise<{
  client: PublicClient;
  block: Block & { number: bigint; hash: Hex };
  nonce: bigint;
}> {
  const chainId = await module.getChainId();
  if (chainId !== ref.chainId)
    throw new ErrorException(`TWAP reference belongs to chain ${ref.chainId}`);
  const controller = await module.getSender();
  if (!isAddressEqual(controller, ref.controller))
    throw new ErrorException(
      "TWAP must be managed by its original controller (@sender)",
    );
  const predicted = await prediction(module, controller, ref.slot);
  if (!isAddressEqual(predicted.address, ref.account))
    throw new ErrorException(
      "TWAP account does not match its controller and slot",
    );
  const client = await module.getClient();
  const block = await client.getBlock();
  const health = await inspectAccount(
    client,
    ref.account,
    controller,
    chainId,
    block.number,
  );
  const history = await accountHistory(
    client,
    ref.account,
    controller,
    chainId,
    health.nonce,
    block.number,
  );
  if (!history.some((params) => orderHash(params) === ref.orderHash))
    throw new ErrorException(
      "TWAP reference is not in the account's verified order history",
    );
  for (const params of history) {
    if (orderHash(params) === ref.orderHash) continue;
    const state = await readOrderState(
      client,
      { account: ref.account, params, orderHash: orderHash(params) },
      block.number,
    );
    if (state.registered && (state.start === 0n || block.timestamp < state.end))
      throw new ErrorException(
        "Another live TWAP uses this account; manage that order first",
      );
  }
  return { client, block, nonce: health.nonce };
}
