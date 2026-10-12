import {
  collectSuggestions,
  describeSentence,
  type EventImportMap,
  type RawLog,
  type SuggestEnv,
  type Suggestion,
  suggestionScript,
  type TokenInfo,
} from "@evmcrispr/sdk";
import {
  type AbiEvent,
  type AbiFunction,
  type Address,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  type Hex,
  parseAbiItem,
  toFunctionSelector,
} from "viem";
import { getPublicClient, getTransports } from "./client";
import { TEST_ACCOUNT_ADDRESS } from "./constants";
import { evml } from "./evml";
import { installAssertionsCore, installSelectorMock } from "./onchain";

export const EXECUTOR = getAddress(
  "0x00000000000000000000000000000000000e0ec0",
);

/** A log as a receipt carries it, from a signature and named args. */
export function eventLog(
  signature: string,
  address: Address,
  args: Record<string, unknown>,
): RawLog {
  const abi = parseAbiItem(signature) as AbiEvent;
  const topics = encodeEventTopics({ abi: [abi], args } as never) as Hex[];
  const plain = abi.inputs.filter((i) => !i.indexed);
  const data = encodeAbiParameters(
    plain,
    plain.map((i) => args[i.name as string]) as never,
  );
  return { address, topics, data };
}

export const viewKey = (address: Address, name: string, ...args: unknown[]) =>
  `${address.toLowerCase()}:${name}(${args.map((a) => String(a).toLowerCase()).join(",")})`;

/** An env whose views answer from a table. A view missing from the table
 *  is a view the contract does not have. Nothing is known of any token
 *  unless `overrides` says so: amounts are base units, tokens variables. */
export function suggestEnv(
  answers: Record<string, unknown>,
  overrides: Partial<SuggestEnv> = {},
): SuggestEnv {
  return {
    chainId: 100,
    executor: EXECUTOR,
    tolerance: 1,
    nativeSymbol: "XDAI",
    nativeDecimals: 18,
    read: async (address, signature, args = []) =>
      answers[
        viewKey(address, (parseAbiItem(signature) as AbiFunction).name, ...args)
      ],
    ...overrides,
  };
}

/** A line with its variables written out again: the addresses it reads
 *  and compares, as literals. */
export const literalLine = (suggestion: Suggestion): string =>
  suggestion.vars.reduce(
    (text, { name, value }) =>
      text.replace(new RegExp(`\\$${name}(?![A-Za-z0-9_])`, "g"), () => value),
    suggestion.line,
  );

const FULL_ADDRESS = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/;

/** What holds of every suggestion, whatever declared it: the description
 *  is its sentence as text, neither it nor the line spells an address out,
 *  no token is written by a symbol, a comment only says the unit of the
 *  line's amounts, and the line's variables are exactly the ones listed. */
export function wellFormed(
  suggestion: Suggestion,
  nativeSymbol = "XDAI",
): void {
  const { line, vars, sentence, description } = suggestion;
  // A host may keep or send a suggestion as JSON: it must survive that.
  const fail = (what: string) => {
    throw new Error(`${what}\n${JSON.stringify(suggestion, null, 2)}`);
  };
  if (
    JSON.stringify(JSON.parse(JSON.stringify(suggestion))) !==
    JSON.stringify(suggestion)
  )
    fail("a suggestion that is not plain data");
  if (sentence.length === 0) fail("a suggestion with no sentence");
  if (description !== describeSentence(sentence))
    fail("a description that is not its sentence");
  if (FULL_ADDRESS.test(description)) fail("a full address in a description");
  if (FULL_ADDRESS.test(line)) fail("a literal address in a line");
  // A token is a variable set to its address, never a symbol: a symbol is
  // resolved again whenever the script runs. Only the chain's own
  // currency, which names no contract, is written by its symbol.
  for (const [, helper, first] of line.matchAll(
    /@(balance!|token:allowance!|token:amount)\(([^\s)]+)/g,
  )) {
    if (first.startsWith("$")) continue;
    if (helper !== "token:allowance!" && first === nativeSymbol) continue;
    fail(`a bare token symbol in a line: ${first}`);
  }
  // The only comment a line carries says the unit of its bare integers:
  // base units of the chain's own currency or of a variable of the line.
  const [, comment] = line.match(/^[^#]*(#.*)$/) ?? [];
  if (comment !== undefined) {
    const said = line.match(/^[^#]* {2}# base units of ([^#]+)$/)?.[1];
    const tokens = said?.split(" and ") ?? [];
    if (
      tokens.length === 0 ||
      !tokens.every(
        (word) =>
          word === nativeSymbol || vars.some(({ name }) => word === `$${name}`),
      )
    )
      fail(`a comment that is not the unit of the line's amounts: ${comment}`);
  }
  const used = [...line.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)/g)].map(
    (m) => m[1],
  );
  const listed = vars.map((v) => v.name);
  if (
    new Set(listed).size !== listed.length ||
    [...new Set(used)].join() !== listed.join()
  )
    fail(`a line that uses [${used}] and lists [${listed}]`);
  for (const { name, value } of vars) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(name)) fail(`a variable named ${name}`);
    if (getAddress(value) !== value) fail(`$${name} is not checksummed`);
  }
}

/** `collectSuggestions`, with every suggestion checked to be well formed. */
export async function suggested(
  input: Parameters<typeof collectSuggestions>[0],
): Promise<Suggestion[]> {
  const out = await collectSuggestions(input);
  for (const suggestion of out) wellFormed(suggestion, input.env.nativeSymbol);
  return out;
}

type Mocks = Record<Address, Record<string, Hex>>;

async function installMocks(mocks: Mocks) {
  const client = getPublicClient();
  await installAssertionsCore(client);
  for (const [address, views] of Object.entries(mocks)) {
    await installSelectorMock(
      client,
      address as Address,
      Object.entries(views).map(([signature, data]) => ({
        selector: toFunctionSelector(`function ${signature}`),
        data,
      })),
    );
  }
  return client;
}

/** Runs a script against the assertions core on the fork. Every contract
 *  in `mocks` answers only the functions listed for it (by signature) and
 *  reverts on any other, so a line that calls another view than the one
 *  its declaration confirmed fails here, as does one that does not compile
 *  or does not hold for the value given. */
export async function scriptHolds(script: string, mocks: Mocks): Promise<void> {
  const client = await installMocks(mocks);
  const tag = evml.with({
    account: TEST_ACCOUNT_ADDRESS,
    chainId: await client.getChainId(),
    transports: getTransports(),
  });
  const result = await tag
    .script(script)
    .simulate({ using: "ethereumjs", from: TEST_ACCOUNT_ADDRESS });
  if (!result.success) throw new Error(`${script}\n${result.error}`);
}

/** An env that reads the same mocks the fork will hold: a view answers
 *  what its mock returns, whatever the arguments, a token is known by its
 *  mocked `symbol()` and `decimals()`, and the mocks are the addresses with
 *  code. */
export function mockedEnv(
  mocks: Mocks,
  overrides: Partial<SuggestEnv> = {},
): SuggestEnv {
  const read: SuggestEnv["read"] = async (address, signature) => {
    const abi = parseAbiItem(signature) as AbiFunction;
    const selector = toFunctionSelector(abi);
    const views = mocks[getAddress(address)] ?? {};
    const data = Object.entries(views).find(
      ([key]) => toFunctionSelector(`function ${key}`) === selector,
    )?.[1];
    if (!data) return undefined;
    try {
      return decodeFunctionResult({ abi: [abi], data });
    } catch {
      return undefined;
    }
  };
  const symbolOf = async (address: Address) => {
    const raw = await read(address, "function symbol() view returns (string)");
    return typeof raw === "string" ? raw : undefined;
  };
  return suggestEnv(
    {},
    {
      read,
      emitterName: symbolOf,
      token: async (address): Promise<TokenInfo> => {
        const symbol = await symbolOf(address);
        const decimals = await read(
          address,
          "function decimals() view returns (uint8)",
        );
        return {
          ...(symbol ? { symbol } : {}),
          ...(typeof decimals === "number" ? { decimals } : {}),
        };
      },
      // On the fork a mock is code, and nothing else is.
      hasCode: async (address) => getAddress(address) in mocks,
      ...overrides,
    },
  );
}

/** What a module's declarations suggest for `logs` when the contracts are
 *  `mocks`, run as a script against those same mocks on the fork: the
 *  lines are the declarations' own, with their variables and loads, so a
 *  declaration whose line reads another view, other arguments or another
 *  contract than the one it confirmed does not hold. */
export async function suggestionsHold(
  module: string,
  events: EventImportMap,
  logs: RawLog[],
  mocks: Mocks,
  overrides: Partial<SuggestEnv> = {},
): Promise<Suggestion[]> {
  const suggestions = await suggested({
    modules: [{ name: module, events }],
    logs,
    env: mockedEnv(mocks, overrides),
  });
  if (suggestions.length === 0) throw new Error("nothing was suggested");
  await scriptHolds(suggestionScript(suggestions), mocks);
  return suggestions;
}
