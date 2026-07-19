import "../setup";
import { describe, it } from "bun:test";
import { BindingsSpace } from "@evmcrispr/sdk";
import {
  expect,
  getTransports,
  TEST_ACCOUNT_ADDRESS,
} from "@evmcrispr/test-utils";
import { gnosis } from "viem/chains";
import { evml, Interpreter } from "../../src";

describe("Core > config variables", () => {
  function createEvm() {
    return new Interpreter(evml.registry, {
      account: TEST_ACCOUNT_ADDRESS,
      chainId: gnosis.id,
      transports: getTransports(),
    });
  }

  async function expectError(promise: Promise<unknown>, fragment: string) {
    try {
      await promise;
      throw new Error("expected to throw");
    } catch (err: any) {
      expect(err.message).to.include(fragment);
    }
  }

  it("sets and reads a declared config variable", async () => {
    const evm = createEvm();
    await evm.interpret(
      'set $std:tokenlist "https://tokens.honeyswap.org"\nset $copy $std:tokenlist',
    );
    expect(evm.getBinding("$std:tokenlist", BindingsSpace.USER)).to.equal(
      "https://tokens.honeyswap.org",
    );
    expect(evm.getBinding("$copy", BindingsSpace.USER)).to.equal(
      "https://tokens.honeyswap.org",
    );
  });

  it("reads the declared default with {chainId} substituted when unset", async () => {
    const evm = createEvm();
    await evm.interpret("set $url $std:tokenlist");
    expect(evm.getBinding("$url", BindingsSpace.USER)).to.equal(
      `https://api.evmcrispr.com/tokenlist/${gnosis.id}`,
    );
  });

  it("reads a loaded module's default", async () => {
    const evm = createEvm();
    await evm.interpret("load coretest\nset $url $coretest:endpoint");
    expect(evm.getBinding("$url", BindingsSpace.USER)).to.equal(
      `https://example.com/${gnosis.id}`,
    );
  });

  it("errors when reading an unset config with no default", async () => {
    const evm = createEvm();
    await expectError(
      evm.interpret("set $x $std:ipfsJwt"),
      "is not set and has no default",
    );
  });

  it("errors on undeclared config keys", async () => {
    await expectError(
      createEvm().interpret('set $std:tokenList "https://x.example"'),
      "unknown config variable $std:tokenList",
    );
    await expectError(
      createEvm().interpret("set $y $std:nope"),
      "unknown config variable $std:nope",
    );
  });

  it("errors when the module is not loaded", async () => {
    const evm = createEvm();
    await expectError(
      evm.interpret('set $coretest:serviceUrl "https://svc.example"'),
      'module "coretest", which is not loaded',
    );
  });

  it("works for loaded module configs", async () => {
    const evm = createEvm();
    await evm.interpret(
      'load coretest\nset $coretest:serviceUrl "https://svc.example"\nset $out $coretest:serviceUrl',
    );
    expect(evm.getBinding("$out", BindingsSpace.USER)).to.equal(
      "https://svc.example",
    );
  });

  it("validates the set value against the declared type", async () => {
    const evm = createEvm();
    await expectError(
      evm.interpret("load coretest\nset $coretest:target 42"),
      "$coretest:target",
    );
  });

  it("rejects malformed colon names in set", async () => {
    const evm = createEvm();
    await expectError(
      evm.interpret('set $std:ipfs.jwt "x"'),
      "not a valid config variable name",
    );
  });

  it("rejects config vars as binding targets outside set", async () => {
    const evm = createEvm();
    await expectError(
      evm.interpret('loop $std:tokenlist of [1 2] (\n  print "x"\n)'),
      "config variables can only be assigned with set",
    );
  });
});
