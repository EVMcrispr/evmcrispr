import "../../setup";
import { afterEach, beforeAll, beforeEach, describe, it } from "bun:test";
import {
  createInterpreter,
  describeCommand,
  expect,
  getPublicClient,
} from "@evmcrispr/test-utils";
import {
  etherscanVerifiedFixtures,
  etherscanVerifyState,
} from "@evmcrispr/test-utils/msw/etherscan";
import type { PublicClient } from "viem";
import {
  concatHex,
  encodeAbiParameters,
  getAddress,
  getContractAddress,
  pad,
} from "viem";

// Reused fixture from packages/test-utils. The address it lives under is
// `0x0000000000000000000000000000000000001234` (lowercased map key) and
// it represents a single-file `Verified` contract, compiler v0.8.20,
// optimizer 200 runs, MIT license, no constructor args.
const VERIFIED_ADDR_LOWER = "0x0000000000000000000000000000000000001234";
const VERIFIED_ADDR = getAddress(VERIFIED_ADDR_LOWER as `0x${string}`);

// Minimal contract creation bytecode reused from deploy.test.ts.
const BYTECODE =
  "0x6080604052348015600f57600080fd5b50603f80601d6000396000f3fe6080604052600080fdfea2646970667358221220abcd";
const SALT_1 = pad("0x01", { size: 32 });
const ARACHNID_CREATE2 = "0x4e59b44847b379578588920ca78fbf26c0b4956c";

// Test client runs against gnosis (chain id 100); see test-utils/client.ts.
const TARGET_CHAIN_ID = 100;

// API key is read at command-run time from process.env, so set it once
// before any test imports take effect. The MSW handlers ignore the key.
const ORIGINAL_API_KEY = process.env.VITE_ETHERSCAN_API_KEY;
process.env.VITE_ETHERSCAN_API_KEY = "test-key";

function lower(addr: string): string {
  return addr.toLowerCase();
}

describe("Std > commands > verify", () => {
  let client: PublicClient;

  beforeAll(() => {
    client = getPublicClient();
  });

  beforeEach(() => {
    etherscanVerifyState.reset();
    process.env.VITE_ETHERSCAN_API_KEY = "test-key";
  });

  afterEach(() => {
    // Restore the env var to whatever the surrounding test environment
    // had set (or remove it if it was unset originally).
    if (ORIGINAL_API_KEY === undefined) {
      delete process.env.VITE_ETHERSCAN_API_KEY;
      process.env.VITE_ETHERSCAN_API_KEY = "test-key";
    } else {
      process.env.VITE_ETHERSCAN_API_KEY = ORIGINAL_API_KEY;
    }
  });

  // ── Mirror happy paths ────────────────────────────────────────────

  it("mirror — same address, different chain: re-submits the verified source on the current chain", async () => {
    const script = `verify ${VERIFIED_ADDR} --mirror-chain 1 --poll-interval 0`;
    const interp = createInterpreter(script, client);
    const actions = await interp.interpret();

    expect(actions).to.eql([]);
    const submitted = etherscanVerifyState.lastSubmit;
    expect(submitted).to.not.equal(undefined);
    if (!submitted) return;
    expect(submitted.get("contractaddress")).to.equal(VERIFIED_ADDR);
    expect(submitted.get("chainid")).to.equal(String(TARGET_CHAIN_ID));
    expect(submitted.get("module")).to.equal("contract");
    expect(submitted.get("action")).to.equal("verifysourcecode");
    expect(submitted.get("codeformat")).to.equal(
      "solidity-standard-json-input",
    );
    expect(submitted.get("compilerversion")).to.equal(
      "v0.8.20+commit.a1b79de6",
    );
    expect(submitted.get("contractname")).to.equal("Verified.sol:Verified");
    expect(submitted.get("licenseType")).to.equal("3"); // MIT

    const sourceCode = submitted.get("sourceCode") ?? "";
    const parsed = JSON.parse(sourceCode);
    expect(parsed.language).to.equal("Solidity");
    expect(parsed.sources["Verified.sol"].content).to.contain(
      "contract Verified",
    );
    expect(parsed.settings.optimizer.enabled).to.equal(true);
    expect(parsed.settings.optimizer.runs).to.equal(200);
    expect(parsed.settings.evmVersion).to.equal("paris");
  });

  it("submission: sends apikey/chainid/module/action as URL query params (Etherscan v2 requirement)", async () => {
    // Etherscan V2's `verifysourcecode` POST rejects requests where these
    // identifiers live in the form body with `Missing or unsupported
    // chainid parameter (required for v2 api)`. This test pins the wire
    // format so a regression to body-only submission can't sneak back in.
    const script = `verify ${VERIFIED_ADDR} --mirror-chain 1 --poll-interval 0`;
    await createInterpreter(script, client).interpret();

    const urlParams = etherscanVerifyState.lastSubmitUrlParams;
    if (!urlParams) throw new Error("expected lastSubmitUrlParams to be set");
    expect(urlParams.get("apikey")).to.equal("test-key");
    expect(urlParams.get("chainid")).to.equal(String(TARGET_CHAIN_ID));
    expect(urlParams.get("module")).to.equal("contract");
    expect(urlParams.get("action")).to.equal("verifysourcecode");

    // Conversely, the contract payload (large + per-submission) belongs
    // in the form body, not the URL.
    expect(urlParams.has("sourceCode")).to.equal(false);
    expect(urlParams.has("contractaddress")).to.equal(false);
  });

  it("mirror — accepts a viem chain name (e.g. `optimism`) for --mirror-chain", async () => {
    // Optimism = chain id 10. The Etherscan MSW only keys fixtures by
    // address (chainid is just echoed as a query param), so the actual
    // assertion is that the command parses + resolves the name without
    // throwing and successfully submits.
    const script = `verify ${VERIFIED_ADDR} --mirror-chain optimism --poll-interval 0`;
    const interp = createInterpreter(script, client);
    await interp.interpret();

    const submitted = etherscanVerifyState.lastSubmit;
    if (!submitted) throw new Error("expected POST submission");
    expect(submitted.get("contractaddress")).to.equal(VERIFIED_ADDR);
    expect(submitted.get("chainid")).to.equal(String(TARGET_CHAIN_ID));
  });

  it("mirror — different address, same chain: uses --mirror-address for source lookup", async () => {
    const TARGET = "0x000000000000000000000000000000000000fffa";
    const script = `verify ${TARGET} --mirror-address ${VERIFIED_ADDR} --poll-interval 0`;
    const interp = createInterpreter(script, client);
    await interp.interpret();

    const submitted = etherscanVerifyState.lastSubmit;
    expect(submitted).to.not.equal(undefined);
    if (!submitted) return;
    expect(submitted.get("contractaddress")).to.equal(getAddress(TARGET));
    // chainid is the *target* chain (gnosis), not the source.
    expect(submitted.get("chainid")).to.equal(String(TARGET_CHAIN_ID));
    expect(submitted.get("compilerversion")).to.equal(
      "v0.8.20+commit.a1b79de6",
    );
  });

  it("mirror — different address AND chain: combines both selectors", async () => {
    const TARGET = "0x000000000000000000000000000000000000fffb";
    const script = `verify ${TARGET} --mirror-chain 1 --mirror-address ${VERIFIED_ADDR} --poll-interval 0`;
    const interp = createInterpreter(script, client);
    await interp.interpret();

    const submitted = etherscanVerifyState.lastSubmit;
    if (!submitted) throw new Error("expected POST submission");
    expect(submitted.get("contractaddress")).to.equal(getAddress(TARGET));
    expect(submitted.get("contractname")).to.equal("Verified.sol:Verified");
  });

  // ── Mirror normalisation of `SourceCode` shapes ──────────────────

  it("mirror normalisation: strips outer braces from a `{{...}}` Standard JSON wrapper", async () => {
    const ADDR_DOUBLE = "0x0000000000000000000000000000000000002001";
    const standardJson = JSON.stringify({
      language: "Solidity",
      sources: {
        "src/Wrapped.sol": {
          content: "// SPDX\npragma solidity ^0.8.0;\ncontract Wrapped {}",
        },
      },
      settings: { optimizer: { enabled: false, runs: 200 } },
    });
    etherscanVerifiedFixtures[ADDR_DOUBLE] = {
      status: "1",
      message: "OK",
      result: [
        {
          SourceCode: `{${standardJson}}`,
          ABI: "[]",
          ContractName: "Wrapped",
          CompilerVersion: "v0.8.21+commit.d9974bed",
          OptimizationUsed: "0",
          Runs: "200",
          ConstructorArguments: "",
          EVMVersion: "shanghai",
          Library: "",
          LicenseType: "Apache-2.0",
          Proxy: "0",
          Implementation: "",
          SwarmSource: "",
        },
      ],
    };

    try {
      await createInterpreter(
        `verify 0x000000000000000000000000000000000000aaaa --mirror-address ${ADDR_DOUBLE} --poll-interval 0`,
        client,
      ).interpret();

      const submitted = etherscanVerifyState.lastSubmit;
      if (!submitted) throw new Error("expected POST submission");

      const submittedSource = submitted.get("sourceCode") ?? "";
      // Outer braces should be stripped — JSON should parse cleanly to the
      // original payload (not the double-wrapped form).
      const parsed = JSON.parse(submittedSource);
      expect(parsed.language).to.equal("Solidity");
      expect(parsed.sources["src/Wrapped.sol"].content).to.contain(
        "contract Wrapped",
      );
      expect(submitted.get("compilerversion")).to.equal(
        "v0.8.21+commit.d9974bed",
      );
      expect(submitted.get("licenseType")).to.equal("12"); // Apache-2.0
    } finally {
      delete etherscanVerifiedFixtures[ADDR_DOUBLE];
    }
  });

  it("mirror normalisation: wraps a flat multi-file dict into a Standard JSON Input", async () => {
    const ADDR_FLAT = "0x0000000000000000000000000000000000002002";
    const flatDict = JSON.stringify({
      "Foo.sol": {
        content: "// SPDX\npragma solidity ^0.8.0;\ncontract Foo {}",
      },
      "Bar.sol": {
        content: "// SPDX\npragma solidity ^0.8.0;\ncontract Bar {}",
      },
    });
    etherscanVerifiedFixtures[ADDR_FLAT] = {
      status: "1",
      message: "OK",
      result: [
        {
          SourceCode: flatDict,
          ABI: "[]",
          ContractName: "Foo",
          CompilerVersion: "v0.8.20+commit.a1b79de6",
          OptimizationUsed: "1",
          Runs: "10000",
          ConstructorArguments: "",
          EVMVersion: "Default",
          Library: "",
          LicenseType: "MIT",
          Proxy: "0",
          Implementation: "",
          SwarmSource: "",
        },
      ],
    };

    try {
      await createInterpreter(
        `verify 0x000000000000000000000000000000000000aaab --mirror-address ${ADDR_FLAT} --poll-interval 0`,
        client,
      ).interpret();

      const submitted = etherscanVerifyState.lastSubmit;
      if (!submitted) throw new Error("expected POST submission");
      const parsed = JSON.parse(submitted.get("sourceCode") ?? "");
      expect(parsed.language).to.equal("Solidity");
      expect(parsed.sources["Foo.sol"].content).to.contain("contract Foo");
      expect(parsed.sources["Bar.sol"].content).to.contain("contract Bar");
      expect(parsed.settings.optimizer.enabled).to.equal(true);
      expect(parsed.settings.optimizer.runs).to.equal(10000);
      // EVMVersion was "Default" so it should be omitted from settings.
      expect(parsed.settings.evmVersion).to.equal(undefined);
    } finally {
      delete etherscanVerifiedFixtures[ADDR_FLAT];
    }
  });

  // ── Self-mirror guard ─────────────────────────────────────────────

  it("self-mirror guard: throws when --mirror-chain + --mirror-address resolve to the current (chain, address)", async () => {
    const script = `verify ${VERIFIED_ADDR} --mirror-chain ${TARGET_CHAIN_ID} --mirror-address ${VERIFIED_ADDR}`;
    const interp = createInterpreter(script, client);
    let caught: Error | undefined;
    try {
      await interp.interpret();
    } catch (e: any) {
      caught = e;
    }
    expect(caught).to.not.equal(undefined);
    expect(caught!.message).to.include("self-mirror");
  });

  // ── Explicit mode ────────────────────────────────────────────────

  it("explicit: forwards Standard JSON verbatim with codeformat=solidity-standard-json-input", async () => {
    const standardJson = JSON.stringify({
      language: "Solidity",
      sources: {
        "src/Foo.sol": {
          content: "// SPDX\npragma solidity ^0.8.0;\ncontract Foo {}",
        },
      },
      settings: { optimizer: { enabled: true, runs: 200 } },
    });
    const ADDR = "0x000000000000000000000000000000000000ffec";
    const script = `verify ${ADDR} --source '${standardJson}' --contract-name "src/Foo.sol:Foo" --compiler "0.8.20+commit.a1b79de6" --license "MIT" --poll-interval 0`;
    const interp = createInterpreter(script, client);
    await interp.interpret();

    const submitted = etherscanVerifyState.lastSubmit;
    if (!submitted) throw new Error("expected POST submission");
    expect(submitted.get("codeformat")).to.equal(
      "solidity-standard-json-input",
    );
    expect(submitted.get("sourceCode")).to.equal(standardJson);
    expect(submitted.get("contractname")).to.equal("src/Foo.sol:Foo");
    expect(submitted.get("compilerversion")).to.equal(
      "v0.8.20+commit.a1b79de6",
    );
    expect(submitted.get("licenseType")).to.equal("3");
    // No constructor args were provided and no mirror to inherit from →
    // the constructorArguements field must be absent.
    expect(submitted.has("constructorArguements")).to.equal(false);
  });

  it("explicit: --constructor + --constructor-args produce expected ABI-encoded constructorArguements", async () => {
    const standardJson = JSON.stringify({
      language: "Solidity",
      sources: {
        "src/Tok.sol": {
          content: "// SPDX\npragma solidity ^0.8.0;\ncontract Tok {}",
        },
      },
      settings: { optimizer: { enabled: false, runs: 200 } },
    });
    const ADDR = "0x000000000000000000000000000000000000ffed";
    const script = `verify ${ADDR} --source '${standardJson}' --contract-name "src/Tok.sol:Tok" --compiler "0.8.20+commit.a1b79de6" --constructor "constructor(uint256,address)" --constructor-args [1e18 0x000000000000000000000000000000000000beef] --poll-interval 0`;
    const interp = createInterpreter(script, client);
    await interp.interpret();

    const expected = encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }],
      [1000000000000000000n, "0x000000000000000000000000000000000000beef"],
    ).slice(2);
    const submitted = etherscanVerifyState.lastSubmit;
    if (!submitted) throw new Error("expected POST submission");
    expect(submitted.get("constructorArguements")).to.equal(expected);
  });

  it("explicit: --constructor-args-hex passes pre-encoded args verbatim", async () => {
    const standardJson = JSON.stringify({
      language: "Solidity",
      sources: {
        "src/Tok.sol": {
          content: "// SPDX\npragma solidity ^0.8.0;\ncontract Tok {}",
        },
      },
      settings: { optimizer: { enabled: false, runs: 200 } },
    });
    const ADDR = "0x000000000000000000000000000000000000ffee";
    const HEX =
      "0x000000000000000000000000000000000000000000000000000000000000002a";
    const script = `verify ${ADDR} --source '${standardJson}' --contract-name "src/Tok.sol:Tok" --compiler "0.8.20+commit.a1b79de6" --constructor-args-hex ${HEX} --poll-interval 0`;
    const interp = createInterpreter(script, client);
    await interp.interpret();

    const submitted = etherscanVerifyState.lastSubmit;
    if (!submitted) throw new Error("expected POST submission");
    // 0x prefix is stripped before sending to Etherscan.
    expect(submitted.get("constructorArguements")).to.equal(HEX.slice(2));
  });

  // ── deploy + verify chains for CREATE2 / CREATE3 ──────────────────

  it("CREATE2 deploy + verify mirror: targets the predicted CREATE2 address", async () => {
    const predicted = getContractAddress({
      opcode: "CREATE2",
      from: ARACHNID_CREATE2,
      salt: SALT_1,
      bytecode: BYTECODE as `0x${string}`,
    });
    // The mirror source can stay on the existing 0x...1234 fixture; we
    // just validate that `verify` resolves $tok to `predicted` and posts
    // it as `contractaddress`.
    etherscanVerifiedFixtures[lower(predicted)] =
      etherscanVerifiedFixtures[VERIFIED_ADDR_LOWER];
    try {
      const script = `deploy $tok ${BYTECODE} --create2 ${SALT_1}\nverify $tok --mirror-chain 1 --poll-interval 0`;
      const interp = createInterpreter(script, client);
      await interp.interpret();

      const submitted = etherscanVerifyState.lastSubmit;
      if (!submitted) throw new Error("expected POST submission");
      expect(submitted.get("contractaddress")).to.equal(predicted);
    } finally {
      delete etherscanVerifiedFixtures[lower(predicted)];
    }
  });

  it("CREATE2 deploy + verify with matching --constructor encodes the same args as deploy", async () => {
    const ctorEncoded = encodeAbiParameters(
      [{ type: "address" }],
      ["0x000000000000000000000000000000000000beef"],
    );
    const initCode = concatHex([BYTECODE as `0x${string}`, ctorEncoded]);
    const predicted = getContractAddress({
      opcode: "CREATE2",
      from: ARACHNID_CREATE2,
      salt: SALT_1,
      bytecode: initCode,
    });
    etherscanVerifiedFixtures[lower(predicted)] =
      etherscanVerifiedFixtures[VERIFIED_ADDR_LOWER];
    try {
      const script = [
        `deploy $tok ${BYTECODE} --create2 ${SALT_1} --constructor "constructor(address)" --constructor-args [0x000000000000000000000000000000000000beef]`,
        `verify $tok --mirror-chain 1 --constructor "constructor(address)" --constructor-args [0x000000000000000000000000000000000000beef] --poll-interval 0`,
      ].join("\n");
      const interp = createInterpreter(script, client);
      await interp.interpret();

      const submitted = etherscanVerifyState.lastSubmit;
      if (!submitted) throw new Error("expected POST submission");
      expect(submitted.get("contractaddress")).to.equal(predicted);
      expect(submitted.get("constructorArguements")).to.equal(
        ctorEncoded.slice(2),
      );
    } finally {
      delete etherscanVerifiedFixtures[lower(predicted)];
    }
  });

  // ── Polling: pending → pass, and timeout ──────────────────────────

  it("polling: keeps polling on `Pending in queue` and succeeds on subsequent `Pass - Verified`", async () => {
    etherscanVerifyState.statusQueue = [
      { status: "0", message: "NOTOK", result: "Pending in queue" },
      { status: "1", message: "OK", result: "Pass - Verified" },
    ];
    const script = `verify ${VERIFIED_ADDR} --mirror-chain 1 --poll-interval 0`;
    const interp = createInterpreter(script, client);
    await interp.interpret();
    expect(etherscanVerifyState.statusQueue.length).to.equal(0);
  });

  it("polling: throws on `Fail - Unable to verify`", async () => {
    etherscanVerifyState.statusResponse = {
      status: "0",
      message: "NOTOK",
      result: "Fail - Unable to verify",
    };
    const script = `verify ${VERIFIED_ADDR} --mirror-chain 1 --poll-interval 0`;
    const interp = createInterpreter(script, client);
    let caught: Error | undefined;
    try {
      await interp.interpret();
    } catch (e: any) {
      caught = e;
    }
    expect(caught).to.not.equal(undefined);
    expect(caught!.message).to.include("Fail - Unable to verify");
  });

  it("submit: treats `Contract source code already verified` as success (no throw, no poll)", async () => {
    etherscanVerifyState.submitResponse = {
      status: "0",
      message: "NOTOK",
      result: "Contract source code already verified",
    };
    // Make any status poll blow up so we can assert polling was skipped.
    etherscanVerifyState.statusResponse = {
      status: "0",
      message: "NOTOK",
      result: "Fail - status poll should not have run",
    };
    const script = `verify ${VERIFIED_ADDR} --mirror-chain 1 --poll-interval 0`;
    const actions = await createInterpreter(script, client).interpret();
    expect(actions).to.eql([]);
  });

  it("submit: throws when Etherscan rejects the submission upfront", async () => {
    etherscanVerifyState.submitResponse = {
      status: "0",
      message: "NOTOK",
      result: "Daily rate limit exceeded",
    };
    const script = `verify ${VERIFIED_ADDR} --mirror-chain 1 --poll-interval 0`;
    const interp = createInterpreter(script, client);
    let caught: Error | undefined;
    try {
      await interp.interpret();
    } catch (e: any) {
      caught = e;
    }
    expect(caught).to.not.equal(undefined);
    expect(caught!.message).to.include("Etherscan rejected submission");
    expect(caught!.message).to.include("Daily rate limit exceeded");
  });

  it("missing API key: throws a clear error before contacting Etherscan", async () => {
    delete process.env.VITE_ETHERSCAN_API_KEY;
    try {
      const script = `verify ${VERIFIED_ADDR} --mirror-chain 1`;
      const interp = createInterpreter(script, client);
      let caught: Error | undefined;
      try {
        await interp.interpret();
      } catch (e: any) {
        caught = e;
      }
      expect(caught).to.not.equal(undefined);
      expect(caught!.message).to.include("VITE_ETHERSCAN_API_KEY");
      expect(etherscanVerifyState.lastSubmit).to.equal(undefined);
    } finally {
      process.env.VITE_ETHERSCAN_API_KEY = "test-key";
    }
  });

  it("mirror: throws when the source address is not verified on the source chain", async () => {
    // 0x...beef is not in `etherscanVerifiedFixtures`, so `getsourcecode`
    // returns the unverified envelope.
    const script = `verify 0x000000000000000000000000000000000000fade --mirror-address 0x00000000000000000000000000000000000000ee --poll-interval 0`;
    const interp = createInterpreter(script, client);
    let caught: Error | undefined;
    try {
      await interp.interpret();
    } catch (e: any) {
      caught = e;
    }
    expect(caught).to.not.equal(undefined);
    expect(caught!.message).to.include("no verified source");
  });
});

// ── Argument / opt validation (string-error cases via describeCommand) ──

describeCommand("verify", {
  describeName: "Std > commands > verify validation",
  errorCases: [
    {
      name: "explicit mode requires --source/--contract-name/--compiler",
      script: `verify ${VERIFIED_ADDR}`,
      error: "explicit mode requires",
    },
    {
      name: "--constructor requires --constructor-args",
      script: `verify ${VERIFIED_ADDR} --mirror-chain 1 --constructor "constructor(uint256)"`,
      error: "verify --constructor requires --constructor-args",
    },
    {
      name: "--constructor-args requires --constructor",
      script: `verify ${VERIFIED_ADDR} --mirror-chain 1 --constructor-args [1]`,
      error: "verify --constructor-args requires --constructor",
    },
    {
      name: "--constructor-args-hex is mutually exclusive with --constructor",
      script: `verify ${VERIFIED_ADDR} --mirror-chain 1 --constructor "constructor(uint256)" --constructor-args [1] --constructor-args-hex 0xdeadbeef`,
      error: "mutually exclusive",
    },
    {
      name: "--mirror-chain rejects unknown chain names with a clear error",
      script: `verify ${VERIFIED_ADDR} --mirror-chain notarealchain --poll-interval 0`,
      error: "must be a chain id or a known chain name",
    },
  ],
});
