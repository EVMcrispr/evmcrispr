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

describe("Core > Interpreter", () => {
  function createEvm() {
    return new Interpreter(evml.registry, {
      account: TEST_ACCOUNT_ADDRESS,
      chainId: gnosis.id,
      transports: getTransports(),
    });
  }

  function createWs() {
    return evml
      .with({ chainId: gnosis.id, transports: getTransports() })
      .workspace();
  }

  describe("interpret()", () => {
    it("should interpret a simple set command and return empty actions", async () => {
      const evm = createEvm();
      const actions = await evm.interpret("set $x 42");
      expect(actions).to.eql([]);
    });

    it("should throw on parse errors", async () => {
      const evm = createEvm();
      try {
        await evm.interpret("(");
        throw new Error("expected to throw");
      } catch (err: any) {
        expect(err.message).to.include("Parse errors");
      }
    });
  });

  describe("getBinding()", () => {
    it("should retrieve user bindings after interpret", async () => {
      const evm = createEvm();
      await evm.interpret("set $myVar 'hello'");
      const value = evm.getBinding("$myVar", BindingsSpace.USER);
      expect(value).to.equal("hello");
    });

    it("should return undefined for non-existent bindings", () => {
      const evm = createEvm();
      const value = evm.getBinding("$nonexistent", BindingsSpace.USER);
      expect(value).to.be.undefined;
    });
  });

  describe("getModule() / getAllModules()", () => {
    it("should return std module by default", async () => {
      const evm = createEvm();
      await evm.interpret("set $x 1");
      const std = evm.getModule("std");
      expect(std).to.not.be.undefined;
      expect(std!.name).to.equal("std");
    });

    it("should return loaded modules after interpret", async () => {
      // Uses the `coretest` stub registered in test/setup.ts.
      const evm = createEvm();
      await evm.interpret("load coretest\nset $x 1");
      const stub = evm.getModule("coretest");
      expect(stub).to.not.be.undefined;
      expect(stub!.name).to.equal("coretest");
    });

    it("should return all modules including std", async () => {
      const evm = createEvm();
      await evm.interpret("set $x 1");
      const modules = evm.getAllModules();
      expect(modules.length).to.be.at.least(1);
      const names = modules.map((m) => m.name);
      expect(names).to.include("std");
    });

    it("should return undefined for unknown module", async () => {
      const evm = createEvm();
      await evm.interpret("set $x 1");
      expect(evm.getModule("nonexistent")).to.be.undefined;
    });
  });

  describe("registerLogListener() / log()", () => {
    it("should call registered listeners", () => {
      const evm = createEvm();
      const messages: string[] = [];
      evm.registerLogListener((msg) => messages.push(msg));
      evm.log("hello");
      evm.log("world");
      expect(messages).to.eql(["hello", "world"]);
    });

    it("should pass previous messages to listener", () => {
      const evm = createEvm();
      const prevLogs: string[][] = [];
      evm.registerLogListener((_msg, prev) => prevLogs.push([...prev]));
      evm.log("first");
      evm.log("second");
      expect(prevLogs[0]).to.eql([]);
      expect(prevLogs[1]).to.eql(["first"]);
    });

    it("should support multiple listeners", () => {
      const evm = createEvm();
      const a: string[] = [];
      const b: string[] = [];
      evm.registerLogListener((msg) => a.push(msg));
      evm.registerLogListener((msg) => b.push(msg));
      evm.log("test");
      expect(a).to.eql(["test"]);
      expect(b).to.eql(["test"]);
    });

    it("should return the Interpreter instance for chaining", () => {
      const evm = createEvm();
      const result = evm.registerLogListener(() => {});
      expect(result).to.equal(evm);
    });
  });

  describe("client / account management", () => {
    it("should return the chain id", async () => {
      const evm = createEvm();
      const chainId = await evm.getChainId();
      expect(chainId).to.equal(100);
    });

    it("should return the connected account", async () => {
      const evm = createEvm();
      const account = await evm.getConnectedAccount();
      expect(account).to.equal(TEST_ACCOUNT_ADDRESS);
    });

    it("should throw when no account is set", async () => {
      const evm = new Interpreter(evml.registry);
      try {
        await evm.getConnectedAccount();
        throw new Error("expected to throw");
      } catch (err: any) {
        expect(err.message).to.include("No connected account");
      }
    });

    it("should update account via setConnectedAccount", async () => {
      const evm = createEvm();
      const newAccount = "0x0000000000000000000000000000000000000002";
      evm.setConnectedAccount(newAccount);
      const account = await evm.getConnectedAccount();
      expect(account).to.equal(newAccount);
    });

    it("should return the chain", async () => {
      const evm = createEvm();
      const chain = await evm.getChain();
      expect(chain).to.not.be.undefined;
      expect(chain!.id).to.equal(100);
    });

    it("should switch chain via switchChainId", async () => {
      const evm = createEvm();
      const newClient = evm.switchChainId(1);
      expect(newClient).to.not.be.undefined;
      const chainId = await evm.getChainId();
      expect(chainId).to.equal(1);
      const chain = await evm.getChain();
      expect(chain!.id).to.equal(1);
    });
  });

  describe("workspace flushCache()", () => {
    it("should not throw when called", () => {
      const ws = createWs();
      expect(() => ws.flushCache()).to.not.throw();
    });
  });

  describe("workspace getDiagnostics()", () => {
    it("should return empty for valid scripts", () => {
      const ws = createWs();
      expect(ws.getDiagnostics("set $x 1")).to.eql([]);
    });

    it("should return diagnostics for invalid scripts", () => {
      const ws = createWs();
      const result = ws.getDiagnostics("(");
      expect(result.length).to.be.greaterThan(0);
    });
  });

  describe("workspace getKeywords()", () => {
    it("should return commands and helpers for a script", async () => {
      const ws = createWs();
      const result = await ws.getKeywords("set $x 1");
      expect(result.commands).to.be.an("array");
      expect(result.helpers).to.be.an("array");
      expect(result.commands).to.include("set");
    });

    it("should include module commands after load", async () => {
      // Uses the `coretest` stub registered in test/setup.ts.
      const ws = createWs();
      const result = await ws.getKeywords("load coretest\nset $x 1");
      expect(result.commands).to.include("coretest:coretest-cmd");
    });
  });
});
