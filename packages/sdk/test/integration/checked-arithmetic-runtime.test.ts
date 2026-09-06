import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Interpreter } from "@evmcrispr/core";
import { evml, registerAllModules } from "@evmcrispr/test-utils/evml";
import {
  ASSERTIONS_RUNTIME_BYTECODE,
  OPERATIONS_RUNTIME_BYTECODE,
} from "@evmcrispr/test-utils/onchain";
import {
  createPublicClient,
  decodeAbiParameters,
  decodeFunctionData,
  encodeAbiParameters,
  type Hex,
  http,
  parseAbiParameters,
  toFunctionSelector,
} from "viem";
import { foundry } from "viem/chains";
import {
  evaluateCheckedExpression,
  INT256_MAX,
  INT256_MIN,
  Num,
  UINT256_MAX,
} from "../../src";
import {
  type CompileCtx,
  compileCheckedExpr,
  encodeResolve,
  operandNode,
  rawParam,
  toWord,
} from "../../src/onchain";
import { CORE_ABI } from "../../src/onchain/core";
import { type Node, NodeType } from "../../src/types";

// An isolated, unforked EVM makes these differential tests independent of RPCs.
const port = 20000 + Math.floor(Math.random() * 20000);
const client = createPublicClient({
  chain: foundry,
  transport: http(`http://127.0.0.1:${port}`, { retryCount: 0 }),
});
registerAllModules();
let process: ReturnType<typeof Bun.spawn>;
const ctx = {
  core: "0x0000000000000000000000000000000000001001",
  operators: "0x0000000000000000000000000000000000001002",
} as unknown as CompileCtx;
beforeAll(async () => {
  process = Bun.spawn(["anvil", "--port", String(port), "--silent"], {
    stdout: "ignore",
    stderr: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try {
      await client.getBlockNumber();
      break;
    } catch {
      await Bun.sleep(20);
    }
  }
  await client.request({
    method: "anvil_setCode" as any,
    params: [ctx.core, ASSERTIONS_RUNTIME_BYTECODE] as any,
  });
  await client.request({
    method: "anvil_setCode" as any,
    params: [ctx.operators, OPERATIONS_RUNTIME_BYTECODE] as any,
  });
});
afterAll(() => process?.kill());
const op = (value: string): Node =>
  ({ type: NodeType.Bareword, value }) as Node;
const live = (value: bigint, signed = value < 0n): Node =>
  operandNode({
    kind: "call",
    cat: signed ? "Int" : "Uint",
    param: rawParam(toWord(value)),
  });
async function resolve(
  nodes: Node[],
  mode: "trunc" | "floor" | "ceil" = "trunc",
): Promise<bigint> {
  const operand = await compileCheckedExpr(ctx, nodes, mode);
  if (operand.kind !== "call") throw new Error("Expected a live expression");
  const response = await client.call({
    to: ctx.core,
    data: encodeResolve(operand.param),
  });
  return decodeAbiParameters(
    [{ type: operand.cat === "Int" ? "int256" : "uint256" }],
    response.data as Hex,
  )[0] as bigint;
}
describe("checked arithmetic real-EVM parity", () => {
  it("matches rounded full-width quotients for mixed signs", async () => {
    for (const a of [7n, -7n, INT256_MIN, UINT256_MAX]) {
      for (const d of [3n, -3n]) {
        for (const mode of ["floor", "ceil"] as const) {
          const tokens = [Num(a), "*", Num(2n), "/", Num(d)];
          let expected: bigint;
          try {
            expected = evaluateCheckedExpression(tokens, mode).toBigInt();
          } catch {
            await expect(
              resolve([live(a), op("*"), live(2n), op("/"), live(d)], mode),
            ).rejects.toThrow();
            continue;
          }
          expect(
            await resolve([live(a), op("*"), live(2n), op("/"), live(d)], mode),
          ).toBe(expected);
        }
      }
    }
  });
  it("checks ordinary multiplication before division and guards mixed signed promotion", async () => {
    await expect(
      resolve([live(UINT256_MAX), op("*"), live(2n), op("//"), live(2n)]),
    ).rejects.toThrow();
    expect(
      await resolve(
        [live(UINT256_MAX), op("*"), live(2n), op("/"), live(2n)],
        "floor",
      ),
    ).toBe(UINT256_MAX);
    await expect(
      resolve([live(UINT256_MAX), op("+"), live(-1n)]),
    ).rejects.toThrow();
    await expect(
      resolve([live(INT256_MAX, true), op("+"), live(1n)]),
    ).rejects.toThrow();
  });
  it("matches signed division, remainder, XOR, and exponentiation", async () => {
    for (const [a, operation, b] of [
      [-7n, "//", 3n],
      [-7n, "%", 3n],
      [-1n, "xor", 3n],
      [-2n, "^", 255n],
      [INT256_MIN, "%", -1n],
    ] as const) {
      expect(await resolve([live(a), op(operation), live(b)])).toBe(
        evaluateCheckedExpression([Num(a), operation, Num(b)]).toBigInt(),
      );
    }
    await expect(resolve([live(2n), op("^"), live(-1n)])).rejects.toThrow();
    await expect(
      resolve([live(INT256_MIN), op("//"), live(-1n)]),
    ).rejects.toThrow();
    await expect(resolve([live(1n), op("//"), live(0n)])).rejects.toThrow();
  });
});

describe("signed ABI provenance through the interpreter", () => {
  it("checks positive signed results from get, arrays and tuple selection as int256", async () => {
    const target = "0x0000000000000000000000000000000000001003";
    for (const [type, value, select] of [
      ["int256", INT256_MAX, "$raw"],
      ["int256[]", [INT256_MAX], "@lang:at($raw 0)"],
      ["(uint256,int256)", [1n, INT256_MAX], "@lang:at($raw 1)"],
    ] as const) {
      const encoded = encodeAbiParameters(parseAbiParameters(type), [
        value,
      ] as any);
      const length = ((encoded.length - 2) / 2).toString(16).padStart(4, "0");
      const runtime = `0x61${length}600e60003961${length}6000f3${encoded.slice(2)}`;
      await client.request({
        method: "anvil_setCode" as any,
        params: [target, runtime] as any,
      });
      const interpreter = new Interpreter(evml.registry, {
        chainId: 31337,
        transports: { 31337: http(`http://127.0.0.1:${port}`) },
      });
      await expect(
        interpreter.interpret(`load lang
set $raw @get(${target} "value()(${type})")
set $result @calc(${select} + 1)`),
      ).rejects.toThrow("overflow");
    }
  });
});

describe("full-width modular arithmetic on a real EVM", () => {
  for (const operation of ["+", "*"]) {
    it(`executes ${operation} modulo without intermediate overflow`, async () => {
      for (const modulus of [1n, 7n, UINT256_MAX]) {
        const expected =
          (operation === "+" ? UINT256_MAX + 2n : UINT256_MAX * 2n) % modulus;
        for (const mode of ["trunc", "floor", "ceil"] as const)
          expect(
            await resolve(
              [
                op("("),
                live(UINT256_MAX),
                op(operation),
                live(2n),
                op(")"),
                op("%"),
                live(modulus),
              ],
              mode,
            ),
          ).toBe(expected);
      }
      await expect(
        resolve([
          op("("),
          live(UINT256_MAX),
          op(operation),
          live(2n),
          op(")"),
          op("%"),
          live(0n),
        ]),
      ).rejects.toThrow();
      await expect(
        resolve([
          op("("),
          live(UINT256_MAX),
          op(operation),
          live(2n),
          op(")"),
          op("%"),
          live(7n, true),
        ]),
      ).rejects.toThrow();
      await expect(
        resolve([
          op("("),
          live(UINT256_MAX),
          op(operation),
          live(2n),
          op(operation),
          live(1n),
          op(")"),
          op("%"),
          live(7n),
        ]),
      ).rejects.toThrow();
      expect(
        await resolve([
          op("("),
          live(-7n),
          op(operation),
          live(2n),
          op(")"),
          op("%"),
          live(3n),
        ]),
      ).toBe(-2n);
    });
  }
});

describe("signed full-width modular EVM parity", () => {
  for (const operation of ["+", "*"]) {
    it(`matches exact bigint ${operation} across signs and int256 boundaries`, async () => {
      for (const a of [INT256_MIN, -7n, 0n, 7n, INT256_MAX]) {
        for (const b of [INT256_MIN, -2n, 0n, 2n, INT256_MAX]) {
          for (const m of [INT256_MIN, -7n, -1n, 1n, 7n, INT256_MAX]) {
            const expected = (operation === "+" ? a + b : a * b) % m;
            expect(
              await resolve([
                op("("),
                live(a, true),
                op(operation),
                live(b, true),
                op(")"),
                op("%"),
                live(m, true),
              ]),
            ).toBe(expected);
          }
        }
      }
      await expect(
        resolve([
          op("("),
          live(INT256_MIN),
          op(operation),
          live(2n),
          op(")"),
          op("%"),
          live(0n),
        ]),
      ).rejects.toThrow();
      await expect(
        resolve([
          op("("),
          live(INT256_MIN),
          op("*"),
          live(2n),
          op(operation),
          live(1n),
          op(")"),
          op("%"),
          live(7n),
        ]),
      ).rejects.toThrow();
      // Signed positive results keep their category for later checked operations.
      await expect(
        resolve([
          op("("),
          live(-1n),
          op(operation),
          live(-1n),
          op(")"),
          op("%"),
          live(7n),
          op("+"),
          live(UINT256_MAX),
        ]),
      ).rejects.toThrow();
    });
  }
});

// Independent fixtures: Python pow(abs(a), e, abs(m)), negated for negative
// bases with odd exponents to match this DSL's signed-remainder convention.
const modularPowerVectors = [
  ["3", "-1", "11", "4"],
  ["-3", "-1", "-11", "-4"],
  ["-3", "-2", "11", "5"],
  ["3", "-3", "10", "3"],
  [
    "2",
    "-1",
    "115792089237316195423570985008687907853269984665640564039457584007913129639935",
    "57896044618658097711785492504343953926634992332820282019728792003956564819968",
  ],
  [
    "115792089237316195423570985008687907853269984665640564039457584007913129639935",
    "-1",
    "115792089237316195423570985008687907853269984665640564039457584007913129639934",
    "1",
  ],
  [
    "-1",
    "-57896044618658097711785492504343953926634992332820282019728792003956564819968",
    "-57896044618658097711785492504343953926634992332820282019728792003956564819968",
    "1",
  ],
  [
    "3",
    "-1",
    "-57896044618658097711785492504343953926634992332820282019728792003956564819968",
    "19298681539552699237261830834781317975544997444273427339909597334652188273323",
  ],
  [
    "2",
    "115792089237316195423570985008687907853269984665640564039457584007913129639935",
    "7",
    "1",
  ],
  [
    "-1",
    "115792089237316195423570985008687907853269984665640564039457584007913129639935",
    "-57896044618658097711785492504343953926634992332820282019728792003956564819968",
    "-1",
  ],
  ["0", "0", "7", "1"],
  ["0", "-1", "1", "0"],
  [
    "-57896044618658097711785492504343953926634992332820282019728792003956564819968",
    "-1",
    "-7",
    "-1",
  ],
  [
    "-57896044618658097711785492504343953926634992332820282019728792003956564819968",
    "2",
    "-7",
    "1",
  ],
  [
    "61646279005314326329577059173060401293252448871466767915303987267081317561906",
    "-55727929001883039327136684838445328320889942441565896530993992624272922016120",
    "27144960288090280520871624551523376825816858639800270058723289140894953937107",
    "17138947178783255975511118644869575403553964573011303818261257801083148251517",
  ],
  [
    "105643219800392446004107852471974924404540947892442446662597534360528279015538",
    "-13494643282079294260123173660159774523944772829159895573252650374511193698031",
    "85904256719964261218660566424328873432059166431872454142813874267260928958823",
    "18308373218892768119600980273309073140461963327491515772384524446582038860559",
  ],
  [
    "65499791145946663943231015332802358028519148721622551224272454218448323899528",
    "-32052669420155881305149729216404381245978628661414173289554199489197368248042",
    "25733713621815493878571799574011362453953609485013997949589447413548709832551",
    "4763197166031535124299922661092796804985588807446870703402966368280316280895",
  ],
  [
    "101093510619300686359099447282964884879506223535228799195588586954084177586600",
    "-3733450557547428796703275253164661745564557588759141327218392146307750876238",
    "85108019457354471281089125930346515125326864715838468543379065575717136694473",
    "44288217517410806385603410842989557204858818058000419201912050875887215112516",
  ],
  [
    "24718384739492771776796391909409618848772581909730379773028572143216911254889",
    "-55140769997836056978873587563645669209098882711323352624941405239331859571546",
    "93408394154094169396164575128064698157172756383977637718917782130292007497913",
    "44313741876564016346502850948958766514990765946659108945584513264205909639935",
  ],
  [
    "82309860384266506057864573782119038251158771458987558459716277180218378157325",
    "-38866206639965108480559719883114771012793975976266384639605521240687718539321",
    "37294282743503774471765379260442114332987163261978585502788354697612911604697",
    "20135469899821052822072016603485859172979065986921447331972262491414994584797",
  ],
  [
    "85634144846772256949103912770459112658592149562395092024058526957300396224107",
    "-52929782481013175863998620660267505071363956799470860945325050044178771240477",
    "97903973750825601301328468667152956961165868192482789046297033340254686038013",
    "59446741230661077128057504592261728296325896281377355856331153773700267633592",
  ],
  [
    "62669256332773546574891637926998555834079646308478431681817311487265128634531",
    "-29960255620255576407787529766237800946419536300691233230097551144022105554951",
    "77316325065795316833355093084116923286590396417624534223727629125332218245913",
    "37461297865152455026784591087628058214829765037579013737166981638011118542145",
  ],
  [
    "84000458501433481124390179648057334985768096478723563888730418449396372836313",
    "-42426011792805629795498062801926701740081509451496866332910077975127691112596",
    "7824391255025031494737130990960360353581676331577565672699504444007634814707",
    "616622929627292993162511932733889109590008561658876721478255855303236824027",
  ],
];
describe("modular inverse real-EVM parity", () => {
  it("matches independent Python vectors in live execution and constant folding", async () => {
    for (const vector of modularPowerVectors) {
      const [a, e, m, expected] = vector.map(BigInt);
      const nodes = [live(a), op("^"), live(e), op("%"), live(m)];
      for (const mode of ["trunc", "floor", "ceil"] as const)
        expect(await resolve(nodes, mode)).toBe(expected);
      const constant = (value: bigint) =>
        operandNode({
          kind: "const",
          cat: value < 0n ? "Int" : "Uint",
          value: Num(value),
        });
      const folded = await compileCheckedExpr(ctx, [
        constant(a),
        op("^"),
        constant(e),
        op("%"),
        constant(m),
      ]);
      expect(folded.kind === "const" && (folded.value as Num).toBigInt()).toBe(
        expected,
      );
      expect(
        evaluateCheckedExpression([
          Num(a),
          "^",
          Num(e),
          "%",
          Num(m),
        ]).toBigInt(),
      ).toBe(expected);
    }
  });
  it("selects all four overloads without narrowing the exponent or unsigned base", async () => {
    for (const baseSigned of [false, true]) {
      for (const exponentSigned of [false, true]) {
        const nodes = [
          live(3n, baseSigned),
          op("^"),
          live(2n, exponentSigned),
          op("%"),
          live(11n),
        ];
        const result = await compileCheckedExpr(ctx, nodes);
        if (result.kind !== "call") throw new Error("Expected call");
        expect(result.cat).toBe(baseSigned ? "Int" : "Uint");
        const [, data] = decodeAbiParameters(
          [{ type: "address" }, { type: "bytes" }],
          result.param.paramData,
        );
        const decoded = decodeFunctionData({ abi: CORE_ABI, data });
        if (decoded.functionName !== "read") throw new Error("Expected read");
        const t = baseSigned ? "int256" : "uint256";
        expect(decoded.args[1]).toBe(
          toFunctionSelector(
            `powMod(${t},${exponentSigned ? "int256" : "uint256"},${t})`,
          ),
        );
        expect(await resolve(nodes)).toBe(9n);
      }
    }
    expect(
      await resolve([live(3n), op("^"), live(-1n), op("%"), live(11n, true)]),
    ).toBe(4n);
  });
  it("rejects missing inverses, zero modulus and invalid mixed promotion", async () => {
    for (const [a, e, m] of [
      [6n, -1n, 9n],
      [0n, -1n, 7n],
      [1n, -1n, 0n],
      [1n, 0n, 0n],
      [UINT256_MAX, -1n, -7n],
    ])
      await expect(
        resolve([live(a), op("^"), live(e), op("%"), live(m)]),
      ).rejects.toThrow();
    await expect(
      resolve([
        live(2n),
        op("^"),
        live(256n),
        op("*"),
        live(1n),
        op("%"),
        live(7n),
      ]),
    ).rejects.toThrow();
  });
});
