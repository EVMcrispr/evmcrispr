import type {
  Address,
  Hash,
  PublicClient,
  Transport,
  WalletClient,
} from "viem";
import type { ModuleAction, ModuleActionDescription } from "../types/actions";

/** What a module action's `send` is given: the host's wallet and clients,
 *  never a host type. Core passes its handler context as it is. */
export interface ModuleActionSendCtx {
  walletClient: WalletClient;
  getPublicClient(chainId?: number): PublicClient;
  onLog(message: string): void;
  signal?: AbortSignal;
  /** Host-configured transports, keyed by chain id. */
  transports?: Record<number, Transport>;
  /** The action was sent: its hash, for the action's box. */
  onSent?(hash: Hash): void;
}

export interface ModuleActionDef<D> {
  /** What a host's review shows. Called once, when the action is made. */
  describe(
    action: Omit<ModuleAction<D>, "description">,
  ): ModuleActionDescription;
  /** What executing the action does. */
  send(action: ModuleAction<D>, ctx: ModuleActionSendCtx): Promise<unknown>;
}

export interface DefinedModuleAction<D> extends ModuleActionDef<D> {
  module: string;
  kind: string;
  /** The action, with its module's description. */
  create(fields: { chainId: number; from: Address; data: D }): ModuleAction<D>;
}

/**
 * A kind of action a module produces. List it in the module class's
 * `static readonly actions`, keyed by `kind`, so a host can send it.
 */
export function defineAction<D>(
  module: string,
  kind: string,
  def: ModuleActionDef<D>,
): DefinedModuleAction<D> {
  return {
    ...def,
    module,
    kind,
    create(fields) {
      const action = { type: "module" as const, module, kind, ...fields };
      return { ...action, description: def.describe(action) };
    },
  };
}
