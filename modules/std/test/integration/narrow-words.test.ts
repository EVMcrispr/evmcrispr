import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createServer } from "node:net";
import { createEvml, Interpreter } from "@evmcrispr/core";
import {
  type AssertionAction,
  CORE_ABI,
  CORE_ADDRESS,
  FETCHER_TYPE,
} from "@evmcrispr/sdk/onchain";
import {
  type Address,
  createPublicClient,
  decodeAbiParameters,
  decodeFunctionData,
  type Hex,
  http,
  numberToHex,
  type PublicClient,
} from "viem";
import { installAssertionsCore } from "../../../../packages/test-utils/src/onchain/install";
import { installConstantMock } from "../../../../packages/test-utils/src/onchain/mock";

// A target that breaks the type it is declared to return: the narrow word
// must never be judged as if it were in range. A dedicated, unforked EVM
// runs the pinned Assertions and Operations bytecode.

let anvil: ReturnType<typeof Bun.spawn>;
let client: PublicClient;
let transport: ReturnType<typeof http>;
const tag = createEvml();

const word = (v: bigint): Hex =>
  numberToHex(v & ((1n << 256n) - 1n), { size: 32 });
const words = (...vs: bigint[]): Hex =>
  `0x${vs.map((v) => word(v).slice(2)).join("")}`;

// Each source answers every call with one fixed returndata.
const SOURCES = {
  valid8: [0xd1000001, word(0xffn)],
  dirty8: [0xd1000002, word(0x100n)],
  validI8: [0xd1000003, word(-128n)],
  dirtyI8: [0xd1000004, word(0x80n)],
  dirtyBool: [0xd1000005, word(2n)],
  dirtyAddress: [0xd1000006, word((1n << 160n) | 0xbeefn)],
  validTuple: [0xd1000007, words(1n, 2n, 0xffffffffn)],
  dirtyTuple: [0xd1000008, words(1n, 2n, 1n << 32n)],
  // valid8 answers balanceOf with 255: a target the core can call.
  validTarget: [0xd1000009, word(0xd1000001n)],
  dirtyTarget: [0xd100000a, word((1n << 160n) | 0xd1000001n)],
} as const;
const at = (name: keyof typeof SOURCES): Address =>
  numberToHex(SOURCES[name][0], { size: 20 });

async function compile(line: string): Promise<AssertionAction> {
  const actions = await new Interpreter(tag.registry, {
    chainId: 1,
    transports: { 1: transport },
  }).interpret(line);
  return actions[0] as AssertionAction;
}

/** Whether the assertion holds on-chain. */
async function holds(line: string): Promise<boolean> {
  const action = await compile(line);
  try {
    await client.call({ to: action.to, data: action.data });
    return true;
  } catch {
    return false;
  }
}

/** The judged param's staticcall target and calldata. */
function judgedCall(action: AssertionAction): { target: Address; data: Hex } {
  const { param } = action.compiled;
  expect(param.fetcherType).toBe(FETCHER_TYPE.StaticCall);
  const [target, data] = decodeAbiParameters(
    [{ type: "address" }, { type: "bytes" }],
    param.paramData,
  );
  return { target, data };
}

beforeAll(async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  anvil = Bun.spawn(
    ["anvil", "--port", String(port), "--chain-id", "1", "--silent"],
    { stdout: "ignore", stderr: "pipe" },
  );
  transport = http(`http://127.0.0.1:${port}`, { retryCount: 0 });
  client = createPublicClient({ transport });
  for (let attempt = 0; ; attempt++) {
    try {
      await client.getChainId();
      break;
    } catch (error) {
      if (attempt > 50) throw error;
      await Bun.sleep(40);
    }
  }
  await installAssertionsCore(client);
  for (const name of Object.keys(SOURCES) as (keyof typeof SOURCES)[])
    await installConstantMock(client, at(name), SOURCES[name][1]);
});
afterAll(() => anvil?.kill());

const read = (name: keyof typeof SOURCES, sig = "number()(uint8)") =>
  `${at(name)}::!{${sig}}`;

describe("a narrow word out of its declared range", () => {
  it("fails an interval comparison, which stays a direct read", async () => {
    const line = `assert ${read("dirty8")} >= 10 "m"`;
    expect(await holds(`assert ${read("valid8")} >= 10 "m"`)).toBe(true);
    expect(await holds(line)).toBe(false);
    // The interval is cut to 0..255 on the raw read: no `nav` hop.
    const { target } = judgedCall(await compile(line));
    expect(target.toLowerCase()).toBe(at("dirty8"));
  });

  it("refuses at build time a comparison no valid value meets", async () => {
    await expect(
      compile(`assert ${read("valid8")} >= 256 "m"`),
    ).rejects.toThrow(/at most 255/);
    await expect(compile(`assert ${read("valid8")} > 255 "m"`)).rejects.toThrow(
      /at most 255/,
    );
  });

  it("fails != and arithmetic, which read it through nav", async () => {
    expect(await holds(`assert ${read("valid8")} != 5 "m"`)).toBe(true);
    expect(await holds(`assert ${read("dirty8")} != 5 "m"`)).toBe(false);
    // 255 * 2 = 510 cannot exceed 510; the malformed 0x100 would give 512.
    expect(await holds(`assert @calc!(${read("valid8")} * 2) > 510 "m"`)).toBe(
      false,
    );
    expect(await holds(`assert @calc!(${read("dirty8")} * 2) > 510 "m"`)).toBe(
      false,
    );
    expect(await holds(`assert @calc!(${read("valid8")} * 2) == 510 "m"`)).toBe(
      true,
    );
    const { target } = judgedCall(
      await compile(`assert ${read("dirty8")} != 5 "m"`),
    );
    expect(target).toBe(CORE_ADDRESS);
  });

  it("fails a signed comparison over an intN that is not sign-extended", async () => {
    const i8 = "number()(int8)";
    // 0x80 is +128 as an int256; no int8 is above 127.
    expect(await holds(`assert ${read("dirtyI8", i8)} > 127 "m"`)).toBe(false);
    expect(await holds(`assert ${read("dirtyI8", i8)} != 0 "m"`)).toBe(false);
    expect(await holds(`assert ${read("validI8", i8)} < -127 "m"`)).toBe(true);
  });

  it("fails a bool or address comparison", async () => {
    expect(
      await holds(`assert ${read("dirtyBool", "flag()(bool)")} == true "m"`),
    ).toBe(false);
    expect(
      await holds(`assert ${read("dirtyBool", "flag()(bool)")} == false "m"`),
    ).toBe(false);
    const sig = "owner()(address)";
    expect(
      await holds(
        `assert ${read("dirtyAddress", sig)} != 0x000000000000000000000000000000000000beef "m"`,
      ),
    ).toBe(false);
    expect(
      await holds(
        `assert ${read("dirtyAddress", sig)} == 0x000000000000000000000000000000000000beef "m"`,
      ),
    ).toBe(false);
  });

  it("fails as a call target, read raw because the core checks targets", async () => {
    const balance = (name: keyof typeof SOURCES) =>
      `assert @balance!(${read(name, "token()(address)")} ${at("valid8")}) == 255 "m"`;
    expect(await holds(balance("validTarget"))).toBe(true);
    expect(await holds(balance("dirtyTarget"))).toBe(false);
    const { target, data } = judgedCall(await compile(balance("dirtyTarget")));
    expect(target).toBe(CORE_ADDRESS);
    const call = decodeFunctionData({ abi: CORE_ABI, data });
    expect(call.functionName).toBe("read");
    const [targetParam] = call.args as unknown as [{ paramData: Hex }];
    const [inner] = decodeAbiParameters(
      [{ type: "address" }, { type: "bytes" }],
      targetParam.paramData,
    );
    expect(inner.toLowerCase()).toBe(at("dirtyTarget"));
  });

  it("is checked as an argument of a wider type, raw as one of its own type", async () => {
    // valid8 ignores its arguments and answers 255.
    const call = (name: keyof typeof SOURCES, type: string) =>
      `assert ${at("valid8")}::!{f(${type})(uint256) ${read(name)}} == 255 "m"`;
    expect(await holds(call("valid8", "uint256"))).toBe(true);
    expect(await holds(call("dirty8", "uint256"))).toBe(false);
    // A uint8 parameter is decoded by the callee, which refuses or cleans
    // the word: no nav hop is spent on it.
    const { data } = judgedCall(await compile(call("dirty8", "uint8")));
    const outer = decodeFunctionData({ abi: CORE_ABI, data });
    expect(outer.functionName).toBe("read");
    const [, , segments] = outer.args as unknown as [
      unknown,
      unknown,
      { paramData: Hex }[],
    ];
    const [argTarget] = decodeAbiParameters(
      [{ type: "address" }, { type: "bytes" }],
      segments[0].paramData,
    );
    expect(argTarget.toLowerCase()).toBe(at("dirty8"));
  });

  it("fails a cond whose condition is out of range, on either branch", async () => {
    const pick = (name: keyof typeof SOURCES, expected: number) =>
      `assert @ifElse!(${read(name, "flag()(bool)")} ? 100 : 200) == ${expected} "m"`;
    // 2 is no bool: neither branch's outcome may pass.
    expect(await holds(pick("dirtyBool", 100))).toBe(false);
    expect(await holds(pick("dirtyBool", 200))).toBe(false);
    // A valid condition still chooses its branch.
    expect(
      await holds(
        `assert @ifElse!(${read("valid8")} > 0 ? 100 : 200) == 100 "m"`,
      ),
    ).toBe(true);
    const { data } = judgedCall(await compile(pick("dirtyBool", 100)));
    const cond = decodeFunctionData({ abi: CORE_ABI, data });
    expect(cond.functionName).toBe("cond");
    const [condition] = cond.args as unknown as [{ paramData: Hex }];
    const [target, inner] = decodeAbiParameters(
      [{ type: "address" }, { type: "bytes" }],
      condition.paramData,
    );
    expect(target).toBe(CORE_ADDRESS);
    expect(
      decodeFunctionData({ abi: CORE_ABI, data: inner }).functionName,
    ).toBe("nav");
  });

  it("fails a lens selection that would otherwise be a raw pick", async () => {
    const sig = "getReserves()(uint112,uint112,uint32)";
    const lens = (name: keyof typeof SOURCES) => `${read(name, sig)}[_ _ $]`;
    expect(await holds(`assert ${lens("validTuple")} != 1 "m"`)).toBe(true);
    expect(await holds(`assert ${lens("dirtyTuple")} != 1 "m"`)).toBe(false);
    expect(await holds(`assert ${lens("validTuple")} >= 1 "m"`)).toBe(true);
    expect(await holds(`assert ${lens("dirtyTuple")} >= 1 "m"`)).toBe(false);
    await expect(
      compile(`assert ${lens("validTuple")} >= 4294967296 "m"`),
    ).rejects.toThrow(/at most 4294967295/);
  });
});
