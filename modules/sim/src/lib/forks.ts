import type {
  BlockExpressionNode,
  CommandExpressionNode,
} from "@evmcrispr/sdk";
import { chainLabel, ErrorException } from "@evmcrispr/sdk";
import {
  type Chain,
  createPublicClient,
  createWalletClient,
  http,
  numberToHex,
  type PublicClient,
  type WalletClient,
} from "viem";
import * as viemChains from "viem/chains";
import type Sim from "..";
import type { SimMode } from "..";
import type { SimBackend } from "./backend";
import { rpcPrefix } from "./modes";

const LOCAL_RPC = "http://localhost:8545";

/** Transport for a fork node's RPC. A cold fork serves its first calls
 *  only after pulling every touched account and slot from the upstream
 *  RPC, which on a fresh node (or a loaded CI runner) outlives viem's
 *  default 10s request timeout — the node isn't dead, it's fetching. */
const forkTransport = (url: string) => http(url, { timeout: 60_000 });

/** Loose equality for RPC URLs that should be treated as the same node. */
export function isSameLocalRpc(a: string, b: string): boolean {
  const normalize = (u: string) =>
    u.toLowerCase().replace(/\/+$/, "").replace("://localhost", "://127.0.0.1");
  return normalize(a) === normalize(b);
}

function chainForId(chainId: number): Chain {
  const found = Object.values(viemChains).find(
    (c) => c && typeof c === "object" && (c as Chain).id === chainId,
  ) as Chain | undefined;
  return (
    found ??
    ({
      id: chainId,
      name: `Chain ${chainId}`,
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [] } },
    } as Chain)
  );
}

/** viem chain export name → chain id (same mapping std's `switch` uses). */
const chainNameToId: Record<string, number> = Object.entries(viemChains).reduce(
  (acc, [name, chain]) => {
    if (chain && typeof chain === "object" && "id" in chain) {
      const id = (chain as Chain).id;
      if (typeof id === "number") acc[name] = id;
    }
    return acc;
  },
  {} as Record<string, number>,
);

function tryResolveChainId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isInteger(n) && n > 0) return n;
    if (chainNameToId[value] !== undefined) return chainNameToId[value];
  }
  return undefined;
}

/**
 * Statically collect the chain ids of literal `switch` targets inside a fork
 * block (recursing into nested blocks). Used by tenderly-multichain, whose
 * environments API requires every network at creation time.
 */
export function collectSwitchTargets(block: BlockExpressionNode): number[] {
  const targets = new Set<number>();

  const visitCommand = (cmd: CommandExpressionNode) => {
    if (cmd.name === "switch" && cmd.args.length > 0) {
      const id = tryResolveChainId((cmd.args[0] as { value?: unknown }).value);
      if (id !== undefined) targets.add(id);
    }
    for (const arg of cmd.args) {
      const block = arg as Partial<BlockExpressionNode>;
      if (block?.type === "BlockExpression" && Array.isArray(block.body)) {
        block.body.forEach(visitCommand);
      }
    }
  };

  block.body.forEach(visitCommand);
  return [...targets];
}

export interface TenderlyAuth {
  user: string;
  project: string;
  accessKey: string;
}

export interface ForkHandle {
  chainId: number;
  chain: Chain;
  publicClient: PublicClient;
  /** Present for anvil/hardhat/tenderly modes; in-process modes have no wallet. */
  walletClient?: WalletClient;
  /** Present for the in-process modes (ethereumjs, revm). */
  backend?: SimBackend;
}

export interface ForkManagerOptions {
  /** Block-number pin for the INITIAL chain; secondary forks use latest. */
  blockNumber?: number;
  auth?: TenderlyAuth;
  /** tenderly-multichain: extra networks to attach at creation. */
  multichainTargets?: number[];
}

/** Per-chain saved state for the anvil/hardhat single-node network swap. */
interface LocalNodeChainState {
  upstreamRpcUrl?: string;
  forkBlockNumber?: bigint;
  stateBlob?: `0x${string}`;
  timeOffset: bigint;
}

/**
 * Tracks one fork per chain inside a `sim:fork` block and switches between
 * them. ethereumjs and tenderly keep concurrent forks (pointer swap);
 * anvil/hardhat share a single local node, so switching dumps the current
 * chain's state and re-forks the node, restoring saved state when a chain
 * is revisited.
 */
export class ForkManager {
  readonly mode: SimMode;
  #module: Sim;
  #opts: ForkManagerOptions;
  #handles = new Map<number, ForkHandle>();
  #active!: ForkHandle;
  #local = new Map<number, LocalNodeChainState>();
  #tenderlyLinks: string[] = [];

  constructor(module: Sim, mode: SimMode, opts: ForkManagerOptions = {}) {
    this.#module = module;
    this.mode = mode;
    this.#opts = opts;
  }

  get active(): ForkHandle {
    return this.#active;
  }

  get tenderlyLinks(): string[] {
    return this.#tenderlyLinks;
  }

  async init(chainId: number): Promise<ForkHandle> {
    switch (this.mode) {
      case "ethereumjs":
      case "revm":
        this.#active = await this.#createInProcess(
          chainId,
          this.#opts.blockNumber,
        );
        break;
      case "tenderly":
        this.#active = await this.#createTenderlyVnet(
          chainId,
          this.#opts.blockNumber,
        );
        break;
      case "tenderly-multichain":
        this.#active = await this.#createTenderlyEnvironment(chainId);
        break;
      default:
        this.#active = await this.#localNodeActivate(
          chainId,
          this.#opts.blockNumber,
        );
        break;
    }
    this.#handles.set(chainId, this.#active);
    return this.#active;
  }

  async activate(chainId: number): Promise<ForkHandle> {
    if (this.#active.chainId === chainId) return this.#active;

    if (this.mode === "anvil" || this.mode === "hardhat") {
      await this.#localNodeSaveActive();
      this.#active = await this.#localNodeActivate(chainId);
      return this.#active;
    }

    let handle = this.#handles.get(chainId);
    if (!handle) {
      if (this.mode === "tenderly-multichain") {
        throw new ErrorException(
          `${chainLabel(chainId)} is not part of the multichain Virtual Environment. ` +
            `Only literal switch targets inside the fork block are attached at ` +
            `creation — use a literal chain name/id in the switch command.`,
        );
      }
      handle =
        this.mode === "ethereumjs" || this.mode === "revm"
          ? await this.#createInProcess(chainId)
          : await this.#createTenderlyVnet(chainId);
      this.#handles.set(chainId, handle);
    }
    this.#active = handle;
    return handle;
  }

  /** Track fork-time warps so the anvil network swap can replay them. */
  noteTimeWarp(seconds: bigint): void {
    if (this.mode !== "anvil" && this.mode !== "hardhat") return;
    const state = this.#local.get(this.#active.chainId);
    if (state) state.timeOffset += seconds;
  }

  #upstreamRpcUrl(chainId: number, chain: Chain): string | undefined {
    const transport = this.#module.getTransport(chainId);
    return (transport({ chain }) as any).value?.url as string | undefined;
  }

  #requireAuth(): TenderlyAuth {
    if (!this.#opts.auth) {
      throw new ErrorException(
        `--using ${this.mode} requires --auth-token user/project/accessKey`,
      );
    }
    return this.#opts.auth;
  }

  // ── in-process backends (ethereumjs, revm) ─────────────────────────────

  async #createInProcess(
    chainId: number,
    blockNumber?: number,
  ): Promise<ForkHandle> {
    const chain = chainForId(chainId);
    const upstreamRpcUrl = this.#upstreamRpcUrl(chainId, chain);
    if (!upstreamRpcUrl) {
      throw new ErrorException(
        `The ${this.mode} backend requires an upstream RPC URL. Make sure a ` +
          `transport is configured for ${chainLabel(chainId)}.`,
      );
    }
    // Dynamic imports keep each backend (and the revm wasm asset) in its own
    // lazy chunk — users who never fork download neither.
    const createBackend =
      this.mode === "revm"
        ? (await import("./revm-backend")).createRevmBackend
        : (await import("./ethereumjs-backend")).createEthereumJSBackend;
    const backend = await createBackend({
      upstreamRpcUrl,
      blockNumber,
      chainId,
      signal: this.#module.context.signal,
    });
    const publicClient = createPublicClient({
      chain,
      transport: backend.transport,
    }) as PublicClient;
    return { chainId, chain, publicClient, backend };
  }

  // ── tenderly (one Virtual Environment per chain) ───────────────────────

  async #tenderlyPost(url: string, body: unknown): Promise<any> {
    const { accessKey } = this.#requireAuth();
    return fetch(url, {
      method: "POST",
      headers: {
        "X-Access-Key": accessKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }).then((res) => res.json());
  }

  async #createTenderlyVnet(
    chainId: number,
    blockNumber?: number,
  ): Promise<ForkHandle> {
    const { user, project } = this.#requireAuth();
    const api = `https://api.tenderly.co/api/v1/account/${user}/project/${project}/vnets`;

    const vnetResponse = await this.#tenderlyPost(api, {
      slug: `evmcrispr-${Date.now()}`,
      display_name: `EVMcrispr Virtual TestNet`,
      fork_config: {
        network_id: chainId,
        block_number: blockNumber ? Number(blockNumber) : "latest",
      },
      virtual_network_config: {
        chain_config: {
          chain_id: chainId,
        },
      },
      rpc_config: {
        rpc_name: "evmcrispr-fork",
        persistence_config: {
          methods: [{ method: "tenderly_simulateTransaction" }],
        },
      },
      sync_state_config: { enabled: false },
      explorer_page_config: {
        enabled: false,
        verification_visibility: "bytecode",
      },
    });

    if (!vnetResponse.id) {
      throw new ErrorException(
        `Failed to create Virtual TestNet: ${JSON.stringify(vnetResponse)}`,
      );
    }

    const rpcUrl =
      vnetResponse.rpcs?.[0]?.url || (vnetResponse.admin_rpc_url as string);
    const chain = chainForId(chainId);
    this.#tenderlyLinks.push(
      `https://dashboard.tenderly.co/${user}/${project}/testnet/${vnetResponse.id}`,
    );

    return {
      chainId,
      chain,
      publicClient: createPublicClient({
        chain,
        transport: forkTransport(rpcUrl),
      }) as PublicClient,
      walletClient: createWalletClient({
        chain,
        transport: forkTransport(rpcUrl),
      }),
    };
  }

  // ── tenderly-multichain (one unified environment, N networks) ──────────

  async #createTenderlyEnvironment(
    initialChainId: number,
  ): Promise<ForkHandle> {
    const { user, project } = this.#requireAuth();
    const chainIds = [
      initialChainId,
      ...(this.#opts.multichainTargets ?? []).filter(
        (id) => id !== initialChainId,
      ),
    ];

    const api = `https://api.tenderly.co/api/public/v1/account/${user}/project/${project}/environments`;
    const response = await this.#tenderlyPost(api, {
      slug: `evmcrispr-${Date.now()}`,
      display_name: "EVMcrispr Multichain Environment",
      network_configs: chainIds.map((id) => ({
        network_id: String(id),
        block_number:
          id === initialChainId && this.#opts.blockNumber
            ? String(this.#opts.blockNumber)
            : "latest",
        chain_config_overrides: { chain_id: String(id) },
      })),
    });

    const vnets = response?.active_instance?.vnets;
    if (!response?.id || !Array.isArray(vnets)) {
      throw new ErrorException(
        `Failed to create multichain Virtual Environment: ${JSON.stringify(response)}`,
      );
    }

    for (let i = 0; i < chainIds.length; i++) {
      const chainId = chainIds[i];
      const vnet =
        vnets.find(
          (v: any) =>
            Number(
              v.network_id ?? v.fork_config?.network_id ?? v.chain_id ?? NaN,
            ) === chainId,
        ) ?? vnets[i];
      const rpcs: { name?: string; url: string }[] = vnet?.rpcs ?? [];
      const rpcUrl =
        rpcs.find((r) => /admin/i.test(r.name ?? ""))?.url ?? rpcs[0]?.url;
      if (!rpcUrl) {
        throw new ErrorException(
          `multichain Virtual Environment returned no RPC for ${chainLabel(chainId)}: ${JSON.stringify(vnet)}`,
        );
      }
      const chain = chainForId(chainId);
      this.#handles.set(chainId, {
        chainId,
        chain,
        publicClient: createPublicClient({
          chain,
          transport: forkTransport(rpcUrl),
        }) as PublicClient,
        walletClient: createWalletClient({
          chain,
          transport: forkTransport(rpcUrl),
        }),
      });
    }

    this.#tenderlyLinks.push(
      `https://dashboard.tenderly.co/${user}/${project}/environments/${response.id}`,
    );

    return this.#handles.get(initialChainId)!;
  }

  // ── anvil / hardhat (single node, dumpState/reset/loadState swap) ──────

  async #localNodeActivate(
    chainId: number,
    pinBlockNumber?: number,
  ): Promise<ForkHandle> {
    const prefix = rpcPrefix(this.mode) as "anvil" | "hardhat";
    const backendName = prefix === "anvil" ? "Anvil" : "Hardhat";
    const chain = chainForId(chainId);

    let handle = this.#handles.get(chainId);
    if (!handle) {
      handle = {
        chainId,
        chain,
        publicClient: createPublicClient({
          chain,
          transport: forkTransport(LOCAL_RPC),
        }) as PublicClient,
        walletClient: createWalletClient({
          chain,
          transport: forkTransport(LOCAL_RPC),
        }),
      };
      this.#handles.set(chainId, handle);
    }

    let state = this.#local.get(chainId);
    if (!state) {
      // First visit: resolve the fork source for this chain. If the
      // configured upstream points at the node we're about to reset,
      // forking from itself deadlocks — ask the node for its real
      // upstream instead.
      let upstreamRpcUrl = this.#upstreamRpcUrl(chainId, chain);
      if (
        prefix === "anvil" &&
        upstreamRpcUrl &&
        isSameLocalRpc(upstreamRpcUrl, LOCAL_RPC)
      ) {
        try {
          const nodeInfo = (await handle.walletClient!.request({
            method: "anvil_nodeInfo" as any,
            params: [] as any,
          })) as { forkConfig?: { forkUrl?: string } } | undefined;
          upstreamRpcUrl = nodeInfo?.forkConfig?.forkUrl;
        } catch {
          upstreamRpcUrl = undefined;
        }
      }
      state = {
        upstreamRpcUrl,
        forkBlockNumber:
          pinBlockNumber !== undefined ? BigInt(pinBlockNumber) : undefined,
        timeOffset: 0n,
      };
      this.#local.set(chainId, state);
    }

    const resetParams: any[] = [];
    if (state.upstreamRpcUrl) {
      const forking: any = { jsonRpcUrl: state.upstreamRpcUrl };
      if (state.forkBlockNumber !== undefined) {
        forking.blockNumber = Number(state.forkBlockNumber);
      }
      resetParams.push({ forking });
    }

    // Re-forking pulls fresh state from the upstream RPC; at `latest` on a
    // loaded machine the first attempt can outlive the transport timeout
    // while the node is still fetching. The reset is idempotent — retry
    // before declaring the backend dead.
    let resetError: Error | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await handle.walletClient!.request({
          method: `${prefix}_reset` as any,
          params: resetParams as any,
        });
        resetError = undefined;
        break;
      } catch (e) {
        resetError = e as Error;
        await new Promise((r) => setTimeout(r, 2_000));
      }
    }
    if (resetError) {
      throw new ErrorException(
        `Failed to reset ${backendName} at ${LOCAL_RPC}. Make sure ${backendName} is running: ${resetError.message}`,
      );
    }

    // Pin the fork base on first visit so revisits re-fork the same block.
    if (state.forkBlockNumber === undefined) {
      const blockNumberHex = (await handle.publicClient.request({
        method: "eth_blockNumber",
      })) as `0x${string}`;
      state.forkBlockNumber = BigInt(blockNumberHex);
    }

    if (state.stateBlob) {
      await handle.walletClient!.request({
        method: `${prefix}_loadState` as any,
        params: [state.stateBlob] as any,
      });
      if (state.timeOffset > 0n) {
        await handle.walletClient!.request({
          method: "evm_increaseTime" as any,
          params: [numberToHex(state.timeOffset)] as any,
        });
        await handle.walletClient!.request({
          method: `${prefix}_mine` as any,
          params: [numberToHex(1n)] as any,
        });
      }
    }

    return handle;
  }

  async #localNodeSaveActive(): Promise<void> {
    const prefix = rpcPrefix(this.mode);
    const current = this.#active;
    const state = this.#local.get(current.chainId);
    if (!state) return;
    try {
      state.stateBlob = (await current.walletClient!.request({
        method: `${prefix}_dumpState` as any,
        params: [] as any,
      })) as `0x${string}`;
    } catch (e) {
      throw new ErrorException(
        `cross-chain simulation with --using ${this.mode} needs ` +
          `${prefix}_dumpState/${prefix}_loadState support on the node ` +
          `(Anvil supports both; plain Hardhat does not): ${(e as Error).message}`,
      );
    }
  }
}
