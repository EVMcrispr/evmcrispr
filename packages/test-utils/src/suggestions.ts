import type { RawLog, SuggestEnv } from "@evmcrispr/sdk";
import {
  type AbiEvent,
  type AbiFunction,
  type Address,
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
 *  is a view the contract does not have. */
export function suggestEnv(
  answers: Record<string, unknown>,
  overrides: Partial<SuggestEnv> = {},
): SuggestEnv {
  return {
    chainId: 100,
    executor: EXECUTOR,
    tolerance: 1,
    nativeSymbol: "XDAI",
    read: async (address, signature, args = []) =>
      answers[
        viewKey(address, (parseAbiItem(signature) as AbiFunction).name, ...args)
      ],
    formatAmount: async (_token, amount) => `${amount} TKN`,
    tokenName: async () => "TKN",
    ...overrides,
  };
}

/** Runs each line against the assertions core on the fork. Every contract
 *  a line reads answers only the functions listed for it (by signature)
 *  and reverts on any other, so a line that calls another view than the
 *  one its declaration confirmed fails here, as does one that does not
 *  compile or does not hold for the value given. */
export async function linesHold(
  module: string,
  lines: string[],
  mocks: Record<Address, Record<string, Hex>>,
): Promise<void> {
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
  const tag = evml.with({
    account: TEST_ACCOUNT_ADDRESS,
    chainId: await client.getChainId(),
    transports: getTransports(),
  });
  for (const line of lines) {
    const script = module === "std" ? line : `load ${module}\n${line}`;
    const result = await tag
      .script(script)
      .simulate({ using: "ethereumjs", from: TEST_ACCOUNT_ADDRESS });
    if (!result.success) throw new Error(`${line}\n${result.error}`);
  }
}
