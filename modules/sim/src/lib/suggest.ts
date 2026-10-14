import {
  type AddressRef,
  budgetedRead,
  collectSuggestions,
  type EventImportMap,
  GAS_ALLOWANCE_FACTOR,
  type IModuleConstructor,
  MAX_SUGGESTION_LOGS,
  MAX_SUGGESTION_READS,
  nativeBalances,
  nativeFloor,
  type RawLog,
  readConfigValue,
  type SuggestEnv,
  type Suggestion,
  safeSymbol,
  symbolInList,
  type TokenInfo,
  type TokenListEntry,
  toSuggestion,
  variableNames,
} from "@evmcrispr/sdk";
import {
  type AbiFunction,
  type Address,
  getAddress,
  type PublicClient,
  parseAbiItem,
} from "viem";
import type Sim from "..";
import { MAX_NATIVE_ACCOUNTS } from "./balance-changes";

/** How long a run waits for the token list before going without it. */
const TOKEN_LIST_TIMEOUT = 5000;

/** The code of an account that delegates to a contract (EIP-7702). */
const DELEGATION = /^0xef0100[0-9a-f]{40}$/i;

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
    /** Accounts whose native balance the run may have changed: before the
     *  first transaction that touched them, and after the last when that
     *  is known (read from the fork otherwise). */
    nativeChanges?: ReadonlyMap<Address, { before: bigint; after?: bigint }>;
    /** Gas the run used and what the fork charged for it. */
    gas: { used: bigint; paid: bigint };
    tolerance: number;
    exact?: boolean;
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
  // What is said of a token is read once per token and through the same
  // budget as every other view, so naming things cannot cost more reads
  // than the run was allowed.
  const once = <T>(ask: (address: Address) => Promise<T>) => {
    const asked = new Map<Address, Promise<T>>();
    return (token: Address) => {
      let answer = asked.get(token);
      if (!answer) {
        answer = ask(token);
        asked.set(token, answer);
      }
      return answer;
    };
  };
  // A token names itself, so its symbol is kept only when it is short and
  // plain; it is a name to show, beside the address, and names nothing in
  // a line.
  const symbolOf = once(async (token) => {
    const raw = await budget.read(
      token,
      "function symbol() view returns (string)",
    );
    return typeof raw === "string" ? safeSymbol(raw) : undefined;
  });
  const nativeSymbol = chain?.nativeCurrency.symbol ?? "ETH";
  // The chain's token list, fetched at most once per run and only when a
  // token was seen. Without it (offline, a list that does not answer in
  // time) no token is vouched for, and each variable is `$token`. The
  // list only ever names a variable: the line holds the address, so a
  // list that changes later cannot move what a line reads.
  let list: Promise<TokenListEntry[]> | undefined;
  const tokenList = () => {
    list ??= (async () => {
      const url = String(
        readConfigValue(module.bindingsManager, "std", "tokenlist", {
          chainId: input.chainId,
        }),
      );
      if (!url.startsWith("https://")) return [];
      const response = await fetch(url, {
        signal: AbortSignal.timeout(TOKEN_LIST_TIMEOUT),
      });
      const { tokens } = (await response.json()) as {
        tokens?: TokenListEntry[];
      };
      return Array.isArray(tokens) ? tokens : [];
    })().catch(() => []);
    return list;
  };
  const tokenOf = once(async (token): Promise<TokenInfo> => {
    const symbol = await symbolOf(token);
    const decimals = await budget.read(
      token,
      "function decimals() view returns (uint8)",
    );
    const listed = symbolInList(
      await tokenList(),
      input.chainId,
      nativeSymbol,
      token,
    );
    return {
      ...(symbol ? { symbol } : {}),
      ...(typeof decimals === "number" ? { decimals } : {}),
      ...(listed ? { listed } : {}),
    };
  });
  // Whether an address has code after the run: what names a variable that
  // nothing else names. Out of the same budget as the views; an account
  // that only delegates (EIP-7702) is still an account.
  const hasCode = once(async (address): Promise<boolean | undefined> => {
    if (!budget.charge()) return undefined;
    try {
      const code = await client.getCode({ address });
      return !!code && code !== "0x" && !DELEGATION.test(code);
    } catch {
      return undefined;
    }
  });
  const env: SuggestEnv = {
    chainId: input.chainId,
    executor: getAddress(input.executor),
    payer: input.payer && getAddress(input.payer),
    tolerance: input.tolerance,
    ...(input.exact ? { exact: true } : {}),
    nativeSymbol,
    // Only what the chain's definition says: an unknown chain keeps its
    // native amounts in base units.
    nativeDecimals: chain?.nativeCurrency.decimals,
    read: budget.read,
    emitterName: symbolOf,
    token: tokenOf,
    hasCode,
  };
  // One run, one set of names: the native floor below shares them.
  const names = variableNames(env.executor);

  const suggestions = await collectSuggestions({
    modules: await moduleEvents(module),
    logs: input.logs,
    env,
    names,
  });
  if (input.nativeBefore !== undefined) {
    const nativeAfter = await client.getBalance({ address: env.executor });
    // The fee the real transaction is assumed to cost at most: the gas
    // this run used at the current price, with room for a padded limit and
    // a price that moved.
    const gasPrice = await client.getGasPrice().catch(() => undefined);
    const native = nativeFloor(
      env,
      input.nativeBefore,
      nativeAfter,
      gasPrice === undefined
        ? undefined
        : {
            paid: input.gas.paid,
            allowance: input.gas.used * gasPrice * GAS_ALLOWANCE_FACTOR,
          },
    );
    if (native) {
      suggestions.push(
        toSuggestion(native, names, {
          module: "std",
          event: "native",
          emitter: env.executor,
        }),
      );
    }
  }
  // The other accounts' balances of the chain's own currency. A token's
  // checks come from its Transfer events; these come from the run's state
  // changes, since a plain transfer emits nothing.
  if (input.nativeChanges && input.nativeChanges.size > 0) {
    const balances: { address: Address; before: bigint; after: bigint }[] = [];
    for (const [address, known] of [...input.nativeChanges].slice(
      0,
      MAX_NATIVE_ACCOUNTS,
    )) {
      const after =
        known.after ??
        (await client.getBalance({ address }).catch(() => undefined));
      if (after !== undefined)
        balances.push({ address, before: known.before, after });
    }
    for (const candidate of await nativeBalances(env, balances)) {
      try {
        const ref = candidate.line.find(
          (p): p is AddressRef => typeof p === "object" && p.ref === "address",
        );
        suggestions.push(
          toSuggestion(candidate, names, {
            module: "std",
            event: "nativeBalance",
            emitter: ref?.address ?? env.executor,
          }),
        );
      } catch {
        // A candidate that cannot be written loses only itself.
      }
    }
  }
  return {
    suggestions,
    truncated:
      input.logs.length > MAX_SUGGESTION_LOGS ||
      budget.exhausted() ||
      (input.nativeChanges?.size ?? 0) > MAX_NATIVE_ACCOUNTS,
  };
}
