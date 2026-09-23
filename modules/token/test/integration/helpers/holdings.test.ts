import { describe, it } from "bun:test";
import type { Action } from "@evmcrispr/sdk";
import { BindingsSpace } from "@evmcrispr/sdk";
import {
  expect,
  getTransports,
  TEST_ACCOUNT_ADDRESS,
} from "@evmcrispr/test-utils";
import { describeHelper, evml, Interpreter } from "@evmcrispr/test-utils/evml";
import { HttpResponse, http } from "@evmcrispr/test-utils/msw/server";
import { helpers } from "../../../src/_generated";
import holdings from "../../../src/helpers/holdings";
import { GNO, SOME_ADDRESS, WXDAI } from "../../fixtures";
import { server } from "../../setup";

const HOLDER = "0x1111111111111111111111111111111111111111";
const EMPTY = "0x2222222222222222222222222222222222222222";
/* Addresses whose explorer answer is an outage, not an answer: the helper
 * must let each of these stop the script instead of calling it a refusal. */
const SERVER_ERROR = "0x3333333333333333333333333333333333333333";
const GARBAGE = "0x4444444444444444444444444444444444444444";
const UNREACHABLE = "0x5555555555555555555555555555555555555555";

const holding = (
  address: string,
  value: string,
  type = "ERC-20",
  extra: Record<string, unknown> = {},
) => ({
  token: {
    address_hash: address,
    symbol: "TKN",
    decimals: "18",
    type,
    ...extra,
  },
  value,
  token_id: null,
  token_instance: null,
});

// Blockscout v2 holdings, as the sdk fetches them: a real ERC-20 mix plus the
// entries the helper must drop — an NFT, a zero balance and a malformed entry.
server.use(
  http.get(
    "https://gnosis.blockscout.com/api/v2/addresses/:address/token-balances",
    ({ params }) => {
      const address = String(params.address).toLowerCase();
      if (address === HOLDER)
        return HttpResponse.json([
          holding(WXDAI.toLowerCase(), "1500000000000000000000"),
          holding(SOME_ADDRESS, "1", "ERC-721"),
          holding(GNO, "42000000000000000000"),
          holding(SOME_ADDRESS, "0"),
          { token: { symbol: "broken" }, value: "5" },
        ]);
      if (address === EMPTY) return HttpResponse.json([]);
      if (address === SERVER_ERROR)
        return HttpResponse.json({ message: "Internal" }, { status: 500 });
      if (address === GARBAGE) return HttpResponse.json({ items: [] });
      if (address === UNREACHABLE) return HttpResponse.error();
      return HttpResponse.json({ message: "Not found" }, { status: 404 });
    },
  ),
);

describeHelper(
  "@token:holdings",
  {
    module: "token",
    declaredErrors: holdings,
    cases: [
      {
        name: "should list the fungible tokens with a balance, checksummed, in explorer order",
        input: `@token:holdings(${HOLDER})`,
        validate: (result) => {
          expect(result).to.deep.equal([WXDAI, GNO]);
        },
      },
      {
        name: "should accept an explicit chain",
        input: `@token:holdings(${HOLDER} gnosis)`,
        validate: (result) => {
          expect(result).to.deep.equal([WXDAI, GNO]);
        },
      },
      {
        name: "should return an empty array for an account holding nothing",
        input: `@token:holdings(${EMPTY})`,
        validate: (result) => {
          expect(result).to.deep.equal([]);
        },
      },
    ],
    errorCases: [
      {
        name: "should refuse a chain with no Blockscout instance",
        input: `@token:holdings(${HOLDER} bsc)`,
        declared: { name: "NoExplorer", fields: { chainId: 56 } },
        error: /BNB Smart Chain/,
      },
      {
        name: "should fail, undeclared, when the explorer answers with an error",
        input: `@token:holdings(${SOME_ADDRESS})`,
        error: /gnosis\.blockscout\.com answered 404/,
      },
      {
        name: "should fail, undeclared, when the explorer payload is not a list",
        input: `@token:holdings(${GARBAGE})`,
        error: /not a list/,
      },
      {
        name: "should fail, undeclared, when the explorer cannot be reached",
        input: `@token:holdings(${UNREACHABLE})`,
        error: /could not reach the explorer/,
      },
    ],
    docCases: [
      {
        description: "List the ERC-20 tokens an account holds",
        code: `set $tokens @token:holdings(0x1111111111111111111111111111111111111111)`,
      },
      {
        description: "Look on another chain",
        code: `set $tokens @token:holdings(0x1111111111111111111111111111111111111111 gnosis)`,
      },
    ],
    sampleArgs: [HOLDER, "gnosis"],
  },
  helpers.holdings.argDefs,
);

// A declared refusal is a failure of the line that evaluated the helper, so
// a capture on that line accepts it. The line then does not run: `set` does
// not assign, and whatever the variable already held stays.
describe("Token > @token:holdings > NoExplorer captures", () => {
  const session = (execute = true) => {
    const interpreter = new Interpreter(evml.registry, {
      account: TEST_ACCOUNT_ADDRESS,
      chainId: 100,
      transports: getTransports(),
    });
    const seen: Action[] = [];
    return {
      seen,
      value: (name: string) =>
        interpreter.bindingsManager.getBindingValue(name, BindingsSpace.USER),
      text: (name: string) => {
        const value = interpreter.bindingsManager.getBindingValue(
          name,
          BindingsSpace.USER,
        );
        return value === undefined ? undefined : String(value);
      },
      exec: (script: string) =>
        interpreter.interpret(
          `load token\n${script}`,
          execute
            ? async (action: Action) => {
                seen.push(action);
                return undefined;
              }
            : undefined,
        ),
    };
  };

  const thrownBy = async (promise: Promise<unknown>): Promise<Error> => {
    try {
      await promise;
    } catch (err) {
      return err as Error;
    }
    throw new Error("expected the script to fail");
  };

  it("accepts a chain with no explorer and keeps the binding it already had", async () => {
    const { exec, text, value, seen } = session();
    await exec(
      [
        `set $tokens [${WXDAI}]`,
        `set $tokens @token:holdings(${HOLDER} bsc) -?/> NoExplorer $missing`,
      ].join("\n"),
    );
    expect(text("$missing")).to.equal("true");
    expect(value("$tokens")).to.deep.equal([WXDAI]);
    expect(seen).to.deep.equal([]);
  });

  it("clears the flag and assigns the list when the explorer answers", async () => {
    const { exec, text, value } = session();
    await exec(
      [
        `set $tokens [${SOME_ADDRESS}]`,
        `set $tokens @token:holdings(${HOLDER}) -?/> NoExplorer $missing`,
      ].join("\n"),
    );
    expect(text("$missing")).to.equal("false");
    expect(value("$tokens")).to.deep.equal([WXDAI, GNO]);
  });

  it("assigns an empty list for an account that holds nothing", async () => {
    const { exec, value } = session();
    await exec(
      [
        `set $tokens [${SOME_ADDRESS}]`,
        `set $tokens @token:holdings(${EMPTY}) -?/> NoExplorer`,
      ].join("\n"),
    );
    expect(value("$tokens")).to.deep.equal([]);
  });

  it("binds the chain id of a required refusal", async () => {
    const { exec, text, value } = session();
    await exec(
      `set $tokens @token:holdings(${HOLDER} bsc) -/> NoExplorer [$chain]`,
    );
    expect(text("$chain")).to.equal("56");
    expect(value("$tokens")).to.be.undefined;
  });

  it("fails a required capture when the lookup succeeds", async () => {
    const { exec } = session();
    const thrown = await thrownBy(
      exec(`set $tokens @token:holdings(${HOLDER}) -/> NoExplorer`),
    );
    expect(thrown.message).to.match(/succeeded/i);
  });

  it("lets an explorer outage through a NoExplorer capture", async () => {
    for (const [address, message] of [
      [SOME_ADDRESS, /answered 404/],
      [SERVER_ERROR, /answered 500/],
      [GARBAGE, /not a list/],
      [UNREACHABLE, /could not reach the explorer/],
    ] as [string, RegExp][]) {
      const { exec, text, value } = session();
      const thrown = await thrownBy(
        exec(
          [
            `set $tokens [${WXDAI}]`,
            `set $tokens @token:holdings(${address}) -?/> NoExplorer $missing`,
          ].join("\n"),
        ),
      );
      expect(thrown.message, address).to.match(message);
      expect(text("$missing"), address).to.be.undefined;
      expect(value("$tokens"), address).to.deep.equal([WXDAI]);
    }
  });

  it("lets an unrelated failure of the same line through", async () => {
    const { exec, text } = session();
    const thrown = await thrownBy(
      exec("set $tokens @token:holdings($nobody) -?/> NoExplorer $missing"),
    );
    expect(thrown.message).to.match(/\$nobody/);
    expect(text("$missing")).to.be.undefined;
  });

  it("lets an explorer outage through a generic capture too", async () => {
    const { exec } = session();
    const thrown = await thrownBy(
      exec(`set $tokens @token:holdings(${SERVER_ERROR}) -?/> $failed`),
    );
    expect(thrown.message).to.match(/answered 500/);
  });

  it("accepts the refusal inside a collecting block, with either refusal arrow", async () => {
    const optional = session();
    await optional.exec(
      [
        `set $tokens [${WXDAI}]`,
        "batch (",
        `  set $tokens @token:holdings(${HOLDER} bsc) -?/> NoExplorer $missing`,
        ")",
      ].join("\n"),
    );
    expect(optional.text("$missing")).to.equal("true");
    expect(optional.value("$tokens")).to.deep.equal([WXDAI]);

    const required = session();
    await required.exec(
      [
        "batch (",
        `  set $tokens @token:holdings(${HOLDER} bsc) -/> NoExplorer [$chain]`,
        ")",
      ].join("\n"),
    );
    expect(required.text("$chain")).to.equal("56");
    expect(required.value("$tokens")).to.be.undefined;
  });

  it("fails a required capture inside a collecting block when the lookup succeeds", async () => {
    const { exec } = session();
    const thrown = await thrownBy(
      exec(
        [
          "batch (",
          `  set $tokens @token:holdings(${HOLDER}) -/> NoExplorer`,
          ")",
        ].join("\n"),
      ),
    );
    expect(thrown.message).to.match(/succeeded/i);
  });
});
