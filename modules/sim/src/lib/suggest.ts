import {
  budgetedRead,
  collectSuggestions,
  compactAmount,
  type EventImportMap,
  type IModuleConstructor,
  MAX_SUGGESTION_LOGS,
  MAX_SUGGESTION_READS,
  nativeFloor,
  type RawLog,
  type SuggestEnv,
  type Suggestion,
  safeSymbol,
  truncateAddress,
} from "@evmcrispr/sdk";
import {
  type AbiFunction,
  type Address,
  formatUnits,
  getAddress,
  type PublicClient,
  parseAbiItem,
} from "viem";
import type Sim from "..";

/** Every registered module's event declarations, std included. A module
 *  that cannot be loaded (experimental and switched off) declares none. */
async function moduleEvents(
  module: Sim,
): Promise<{ name: string; events: EventImportMap }[]> {
  const found: { name: string; events: EventImportMap }[] = [];
  const add = (name: string, ctor: IModuleConstructor | undefined) => {
    if (ctor?.events && Object.keys(ctor.events).length > 0) {
      found.push({ name, events: ctor.events });
    }
  };
  add(
    "std",
    module.context.getStd?.()?.constructor as IModuleConstructor | undefined,
  );
  for (const name of module.context.getAvailableModuleNames()) {
    if (name === "std") continue;
    try {
      add(name, (await module.context.loadModule(name)).default);
    } catch {
      // Not loadable here: nothing to match against.
    }
  }
  return found;
}

export async function suggestFromRun(
  module: Sim,
  input: {
    client: PublicClient;
    chainId: number;
    logs: readonly RawLog[];
    executor: Address;
    payer: Address | undefined;
    nativeBefore: bigint | undefined;
    tolerance: number;
  },
): Promise<{ suggestions: Suggestion[]; truncated: boolean }> {
  const { client } = input;
  const chain = await module.getChain();
  const budget = budgetedRead(async (address, signature, args = []) => {
    try {
      const abi = parseAbiItem(signature) as AbiFunction;
      return await client.readContract({
        address,
        abi: [abi],
        functionName: abi.name,
        args: args as unknown[],
      });
    } catch {
      return undefined;
    }
  }, MAX_SUGGESTION_READS);
  // What a description says about a token is read once per token and
  // through the same budget as every other view, so naming things cannot
  // cost more reads than the run was allowed.
  const metas = new Map<
    Address,
    Promise<{ symbol: string; decimals: number } | undefined>
  >();
  const metaOf = (token: Address) => {
    let meta = metas.get(token);
    if (!meta) {
      meta = (async () => {
        const symbol = await budget.read(
          token,
          "function symbol() view returns (string)",
        );
        const decimals = await budget.read(
          token,
          "function decimals() view returns (uint8)",
        );
        const plain = typeof symbol === "string" && safeSymbol(symbol);
        return plain && typeof decimals === "number"
          ? { symbol: plain, decimals }
          : undefined;
      })();
      metas.set(token, meta);
    }
    return meta;
  };
  const env: SuggestEnv = {
    chainId: input.chainId,
    executor: getAddress(input.executor),
    payer: input.payer && getAddress(input.payer),
    tolerance: input.tolerance,
    nativeSymbol: chain?.nativeCurrency.symbol ?? "ETH",
    read: budget.read,
    // A token names itself, so its symbol is shown only when it is short
    // and plain, and never alone: the address beside it is what tells a
    // token from one that borrowed its symbol.
    formatAmount: async (token, amount) => {
      const meta = await metaOf(token);
      return meta
        ? `${compactAmount(formatUnits(amount, meta.decimals))} ${meta.symbol} (${truncateAddress(token)})`
        : `${amount} base units of ${truncateAddress(token)}`;
    },
    tokenName: async (token) => {
      const meta = await metaOf(token);
      return meta
        ? `${meta.symbol} (${truncateAddress(token)})`
        : truncateAddress(token);
    },
  };

  const suggestions = await collectSuggestions({
    modules: await moduleEvents(module),
    logs: input.logs,
    env,
  });
  if (input.nativeBefore !== undefined) {
    const nativeAfter = await client.getBalance({ address: env.executor });
    const native = nativeFloor(env, input.nativeBefore, nativeAfter);
    if (native) {
      suggestions.push({
        ...native,
        module: "std",
        event: "native",
        emitter: env.executor,
      });
    }
  }
  return {
    suggestions,
    truncated: input.logs.length > MAX_SUGGESTION_LOGS || budget.exhausted(),
  };
}
