import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import { createInterpreter, describeCommand } from "@evmcrispr/test-utils/evml";
import type { PublicClient } from "viem";

describeCommand("print", {
  describeName: "Std > commands > print > doc examples",
  docCases: [
    { description: "Print a string", code: `print "hello"` },
    { description: "Print multiple values", code: `print "count:" 42` },
    {
      description: "Print variables",
      code: `set $name "world"\nprint "hello" $name`,
    },
    {
      description: "Print column arrays as a table",
      code: `print [[alice bob] [10 20]] --table [Name Score]`,
    },
  ],
});

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

  it("should render a markdown table with --table", async () => {
    const logs: string[] = [];
    const interpreter = createInterpreter(
      "print [[a c] [b d]] --table [First Second]",
      client,
    );
    interpreter.registerLogListener((msg) => logs.push(msg));
    await interpreter.interpret();

    expect(logs).to.have.length(1);
    expect(logs[0]).to.equal(
      "| First | Second |\n| --- | --- |\n| a | b |\n| c | d |",
    );
  });

  it("should treat each printed array as a column with --table", async () => {
    const logs: string[] = [];
    const interpreter = createInterpreter(
      "print [a c] [b d] --table [First Second]",
      client,
    );
    interpreter.registerLogListener((msg) => logs.push(msg));
    await interpreter.interpret();

    expect(logs).to.have.length(1);
    expect(logs[0]).to.equal(
      "| First | Second |\n| --- | --- |\n| a | b |\n| c | d |",
    );
  });

  it("should pad shorter columns with empty cells", async () => {
    const logs: string[] = [];
    const interpreter = createInterpreter(
      "print [[a c] [b]] --table [First Second]",
      client,
    );
    interpreter.registerLogListener((msg) => logs.push(msg));
    await interpreter.interpret();

    expect(logs).to.have.length(1);
    expect(logs[0]).to.equal(
      "| First | Second |\n| --- | --- |\n| a | b |\n| c |  |",
    );
  });

  it("should fail when --table names a different number of columns", async () => {
    const interpreter = createInterpreter(
      "print [[a c] [b d]] --table [First]",
      client,
    );
    try {
      await interpreter.interpret();
      throw new Error("Expected interpret to throw");
    } catch (err: any) {
      expect(err.message).to.include(
        "--table names 1 column but 2 were printed",
      );
    }
  });

  it("should fail when --table values are not arrays", async () => {
    const interpreter = createInterpreter(
      'print "hello" --table [First]',
      client,
    );
    try {
      await interpreter.interpret();
      throw new Error("Expected interpret to throw");
    } catch (err: any) {
      expect(err.message).to.include("--table expects an array per column");
    }
  });
});
