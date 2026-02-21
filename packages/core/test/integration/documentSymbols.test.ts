import "../setup";
import { describe, it } from "bun:test";
import { expect } from "chai";
import { EVMcrispr } from "../../src/EVMcrispr";

function symbols(script: string) {
  const evm = new EVMcrispr();
  return evm.getDocumentSymbols(script);
}

describe("Core > documentSymbols", () => {
  it("should return symbols for simple commands", () => {
    const result = symbols("set $x 1\nset $y 2");
    expect(result).to.have.lengthOf(2);
    expect(result[0].name).to.include("set");
    expect(result[0].kind).to.equal("variable");
    expect(result[1].name).to.include("set");
  });

  it("should return block symbols for commands with blocks", () => {
    const script = `load aragonos --as ar
ar:connect 0x1234567890abcdef1234567890abcdef12345678 (
  set $x 1
)`;
    const result = symbols(script);
    expect(result).to.have.lengthOf(2);

    const loadSym = result[0];
    expect(loadSym.name).to.include("load");
    expect(loadSym.kind).to.equal("command");

    const connectSym = result[1];
    expect(connectSym.name).to.include("connect");
    expect(connectSym.kind).to.equal("block");
    expect(connectSym.children).to.have.lengthOf(1);
    expect(connectSym.children![0].name).to.include("set");
  });

  it("should include correct range data", () => {
    const result = symbols("set $foo 42");
    expect(result).to.have.lengthOf(1);
    const sym = result[0];
    expect(sym.range.startLine).to.equal(1);
    expect(sym.selectionRange.startLine).to.equal(1);
    expect(sym.selectionRange.startCol).to.be.a("number");
  });

  it("should return empty array for invalid scripts", () => {
    const result = symbols("((( totally broken");
    expect(result).to.be.an("array");
  });

  it("should return empty array for empty scripts", () => {
    const result = symbols("");
    expect(result).to.eql([]);
  });

  it("should handle nested blocks", () => {
    const script = `load aragonos --as ar
ar:connect 0x1234567890abcdef1234567890abcdef12345678 (
  connect 0xabcdefabcdefabcdefabcdefabcdefabcdefabcd (
    set $inner 1
  )
)`;
    const result = symbols(script);
    const connectSym = result[1];
    expect(connectSym.children).to.have.lengthOf(1);
    const nestedConnect = connectSym.children![0];
    expect(nestedConnect.kind).to.equal("block");
    expect(nestedConnect.children).to.have.lengthOf(1);
    expect(nestedConnect.children![0].kind).to.equal("variable");
  });

  it("should include command options in labels", () => {
    const result = symbols("load aragonos --as ar");
    expect(result[0].name).to.include("--as");
  });
});
