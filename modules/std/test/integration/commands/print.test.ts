import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import {
  createInterpreter,
  expect,
  getPublicClient,
} from "@evmcrispr/test-utils";
import type { PublicClient } from "viem";

describe("Std > commands > print <...values>", () => {
  let client: PublicClient;

  beforeAll(() => {
    client = getPublicClient();
  });

  it("should log a single value", async () => {
    const logs: string[] = [];
    const interpreter = createInterpreter('print "hello"', client);
    interpreter.registerLogListener((msg) => logs.push(msg));
    await interpreter.interpret();

    expect(logs).to.have.length(1);
    expect(logs[0]).to.equal("hello");
  });

  it("should concatenate multiple values", async () => {
    const logs: string[] = [];
    const interpreter = createInterpreter('print "count: " 42', client);
    interpreter.registerLogListener((msg) => logs.push(msg));
    await interpreter.interpret();

    expect(logs).to.have.length(1);
    expect(logs[0]).to.equal("count: 42");
  });

  it("should print variable values", async () => {
    const logs: string[] = [];
    const interpreter = createInterpreter(
      'set $name "world"\nprint "hello " $name',
      client,
    );
    interpreter.registerLogListener((msg) => logs.push(msg));
    await interpreter.interpret();

    expect(logs).to.have.length(1);
    expect(logs[0]).to.equal("hello world");
  });

  it("should print numeric values", async () => {
    const logs: string[] = [];
    const interpreter = createInterpreter("print 1e18", client);
    interpreter.registerLogListener((msg) => logs.push(msg));
    await interpreter.interpret();

    expect(logs).to.have.length(1);
    expect(logs[0]).to.equal("1000000000000000000");
  });

  it("should print address values", async () => {
    const logs: string[] = [];
    const interpreter = createInterpreter(
      "print 0x44fA8E6f47987339850636F88629646662444217",
      client,
    );
    interpreter.registerLogListener((msg) => logs.push(msg));
    await interpreter.interpret();

    expect(logs).to.have.length(1);
    expect(logs[0]).to.equal("0x44fA8E6f47987339850636F88629646662444217");
  });

  it("should print helper results", async () => {
    const logs: string[] = [];
    const interpreter = createInterpreter("print @token(DAI)", client);
    interpreter.registerLogListener((msg) => logs.push(msg));
    await interpreter.interpret();

    expect(logs).to.have.length(1);
    expect(logs[0]).to.equal("0x44fA8E6f47987339850636F88629646662444217");
  });

  it("should handle multiple print commands", async () => {
    const logs: string[] = [];
    const interpreter = createInterpreter(
      'print "line1"\nprint "line2"\nprint "line3"',
      client,
    );
    interpreter.registerLogListener((msg) => logs.push(msg));
    await interpreter.interpret();

    expect(logs).to.have.length(3);
    expect(logs[0]).to.equal("line1");
    expect(logs[1]).to.equal("line2");
    expect(logs[2]).to.equal("line3");
  });
});
