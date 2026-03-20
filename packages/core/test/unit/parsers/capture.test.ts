import { describe, it } from "bun:test";
import type { CommandExpressionNode } from "@evmcrispr/sdk";
import { expect, runParser } from "@evmcrispr/test-utils";
import {
  errorCaptureParser,
  eventCaptureParser,
} from "../../../src/parsers/capture";
import { commandExpressionParser } from "../../../src/parsers/command";
import { parseScript } from "../../../src/parsers/script";

describe("Parsers - event capture", () => {
  describe("eventCaptureParser", () => {
    it("should parse a simple event capture with one variable", () => {
      const result = runParser(eventCaptureParser, "-> Withdrawn [$amount]");
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "Withdrawn",
        captures: ["amount"],
      });
      expect(result.contractFilter).to.be.undefined;
      expect(result.eventParams).to.be.undefined;
      expect(result.occurrence).to.be.undefined;
    });

    it("should parse a capture with a hole (skip position 0)", () => {
      const result = runParser(
        eventCaptureParser,
        "-> Withdrawn(address,uint) [_ $amount]",
      );
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "Withdrawn",
        eventParams: ["address", "uint"],
        captures: [null, "amount"],
      });
    });

    it("should parse multiple captures", () => {
      const result = runParser(
        eventCaptureParser,
        "-> Withdrawn(uint,address) [$amount $to]",
      );
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "Withdrawn",
        eventParams: ["uint", "address"],
        captures: ["amount", "to"],
      });
    });

    it("should parse nested destructure pattern", () => {
      const result = runParser(
        eventCaptureParser,
        "-> Evt(uint,(address,uint)) [$x [_ $y]]",
      );
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "Evt",
        eventParams: ["uint", "(address,uint)"],
        captures: ["x", [null, "y"]],
      });
    });

    it("should parse occurrence selector", () => {
      const result = runParser(eventCaptureParser, "-> Transfer#1 [$amount]");
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "Transfer",
        occurrence: 1,
        captures: ["amount"],
      });
    });

    it("should parse inline event params", () => {
      const result = runParser(
        eventCaptureParser,
        "-> Withdrawn(uint256,address) [$amount]",
      );
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "Withdrawn",
        eventParams: ["uint256", "address"],
        captures: ["amount"],
      });
    });

    it("should parse inline event params with occurrence", () => {
      const result = runParser(
        eventCaptureParser,
        "-> Swapped(uint256,uint256)#1 [$amount]",
      );
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "Swapped",
        eventParams: ["uint256", "uint256"],
        occurrence: 1,
        captures: ["amount"],
      });
    });

    it("should parse contract filter with variable", () => {
      const result = runParser(
        eventCaptureParser,
        "-> $token:Transfer [$amount]",
      );
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "Transfer",
        captures: ["amount"],
      });
      expect(result.contractFilter).to.deep.include({
        type: "VariableIdentifier",
        value: "$token",
      });
    });

    it("should parse contract filter with address literal", () => {
      const result = runParser(
        eventCaptureParser,
        "-> 0x9C33eaCc2F50E39940D3AfaF2c7B8246B681A374:Transfer [$amount]",
      );
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "Transfer",
        captures: ["amount"],
      });
      expect(result.contractFilter).to.deep.include({
        type: "AddressLiteral",
        value: "0x9C33eaCc2F50E39940D3AfaF2c7B8246B681A374",
      });
    });

    it("should parse contract filter with inline params", () => {
      const result = runParser(
        eventCaptureParser,
        "-> $c:Withdrawn(uint256,address) [_ $to]",
      );
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "Withdrawn",
        eventParams: ["uint256", "address"],
        captures: [null, "to"],
      });
      expect(result.contractFilter).to.deep.include({
        type: "VariableIdentifier",
        value: "$c",
      });
    });

    it("should parse inline tuple event params", () => {
      const result = runParser(
        eventCaptureParser,
        "-> MyEvent(uint256,(address,uint256)[]) [$val]",
      );
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "MyEvent",
        eventParams: ["uint256", "(address,uint256)[]"],
        captures: ["val"],
      });
    });

    it("should parse captures with multiple holes", () => {
      const result = runParser(
        eventCaptureParser,
        "-> Evt(uint,address,uint) [_ _ $third]",
      );
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "Evt",
        eventParams: ["uint", "address", "uint"],
        captures: [null, null, "third"],
      });
    });
  });

  describe("commandExpressionParser with event captures", () => {
    it("should parse exec with single event capture", () => {
      const result = runParser(
        commandExpressionParser,
        "exec $c withdraw() -> Withdrawn [$amount]",
      );
      expect(result.type).to.equal("CommandExpression");
      expect(result.name).to.equal("exec");
      expect(result.eventCaptures).to.have.lengthOf(1);
      expect(result.eventCaptures[0]).to.deep.include({
        type: "EventCapture",
        eventName: "Withdrawn",
        captures: ["amount"],
      });
    });

    it("should parse exec with multiple event captures", () => {
      const result = runParser(
        commandExpressionParser,
        "exec $c swap() -> TokensWithdrawn [$a] -> TokensDeposited [$b]",
      );
      expect(result.type).to.equal("CommandExpression");
      expect(result.name).to.equal("exec");
      expect(result.eventCaptures).to.have.lengthOf(2);
      expect(result.eventCaptures[0]).to.deep.include({
        type: "EventCapture",
        eventName: "TokensWithdrawn",
        captures: ["a"],
      });
      expect(result.eventCaptures[1]).to.deep.include({
        type: "EventCapture",
        eventName: "TokensDeposited",
        captures: ["b"],
      });
    });

    it("should parse exec without event captures (no eventCaptures property)", () => {
      const result = runParser(
        commandExpressionParser,
        "exec $c withdraw() 100",
      );
      expect(result.type).to.equal("CommandExpression");
      expect(result.name).to.equal("exec");
      expect(result.eventCaptures).to.be.undefined;
    });

    it("should parse exec with inline event signature and destructure", () => {
      const result = runParser(
        commandExpressionParser,
        "exec $c withdraw() -> Withdrawn(uint256,address) [_ $to]",
      );
      expect(result.eventCaptures).to.have.lengthOf(1);
      expect(result.eventCaptures[0]).to.deep.include({
        type: "EventCapture",
        eventName: "Withdrawn",
        eventParams: ["uint256", "address"],
        captures: [null, "to"],
      });
    });

    it("should parse exec with contract filter", () => {
      const result = runParser(
        commandExpressionParser,
        "exec $c withdraw() -> $c:Withdrawn [$amount]",
      );
      expect(result.eventCaptures).to.have.lengthOf(1);
      expect(result.eventCaptures[0].contractFilter).to.deep.include({
        type: "VariableIdentifier",
        value: "$c",
      });
    });

    it("should parse exec with event capture and comment", () => {
      const result = runParser(
        commandExpressionParser,
        "exec $c withdraw() -> Withdrawn [$amount] # capture the amount",
      );
      expect(result.eventCaptures).to.have.lengthOf(1);
      expect(result.eventCaptures[0]).to.deep.include({
        type: "EventCapture",
        eventName: "Withdrawn",
        captures: ["amount"],
      });
    });

    it("should parse batch with block expression followed by event capture", () => {
      const script = `batch (
  exec $c deposit() --value 1e18
  exec $c withdraw(uint) 1e18
) -> Deposit(address,uint) [_ $amount]`;

      const { ast, errors } = parseScript(script);
      expect(errors).to.have.lengthOf(0);

      const batchNode = ast.body[0] as CommandExpressionNode;
      expect(batchNode.type).to.equal("CommandExpression");
      expect(batchNode.name).to.equal("batch");
      expect(batchNode.args).to.have.lengthOf(1);
      expect(batchNode.eventCaptures).to.have.lengthOf(1);
      expect(batchNode.eventCaptures![0]).to.deep.include({
        type: "EventCapture",
        eventName: "Deposit",
        eventParams: ["address", "uint"],
        captures: [null, "amount"],
      });
    });
  });
});

describe("Parsers - error capture", () => {
  describe("errorCaptureParser", () => {
    it("should parse a required error capture with named error", () => {
      const result = runParser(
        errorCaptureParser,
        "-!> InsufficientBalance(uint256,uint256) [$balance $required]",
      );
      expect(result).to.deep.include({
        type: "ErrorCapture",
        errorName: "InsufficientBalance",
        errorParams: ["uint256", "uint256"],
        optional: false,
        captures: ["balance", "required"],
      });
    });

    it("should parse an optional error capture", () => {
      const result = runParser(
        errorCaptureParser,
        "-?!> InsufficientBalance(uint256) [$balance]",
      );
      expect(result).to.deep.include({
        type: "ErrorCapture",
        errorName: "InsufficientBalance",
        errorParams: ["uint256"],
        optional: true,
        captures: ["balance"],
      });
    });

    it("should parse Error(string) capture", () => {
      const result = runParser(
        errorCaptureParser,
        "-!> Error(string) [$reason]",
      );
      expect(result).to.deep.include({
        type: "ErrorCapture",
        errorName: "Error",
        errorParams: ["string"],
        optional: false,
        captures: ["reason"],
      });
    });

    it("should parse Panic(uint256) capture", () => {
      const result = runParser(
        errorCaptureParser,
        "-!> Panic(uint256) [$code]",
      );
      expect(result).to.deep.include({
        type: "ErrorCapture",
        errorName: "Panic",
        errorParams: ["uint256"],
        optional: false,
        captures: ["code"],
      });
    });

    it("should parse generic catch-all (no error name)", () => {
      const result = runParser(errorCaptureParser, "-!> [$reason]");
      expect(result).to.deep.include({
        type: "ErrorCapture",
        optional: false,
        captures: ["reason"],
      });
      expect(result.errorName).to.be.undefined;
      expect(result.errorParams).to.be.undefined;
    });

    it("should parse optional generic catch-all", () => {
      const result = runParser(errorCaptureParser, "-?!> [$reason]");
      expect(result).to.deep.include({
        type: "ErrorCapture",
        optional: true,
        captures: ["reason"],
      });
      expect(result.errorName).to.be.undefined;
    });

    it("should parse named error without inline params", () => {
      const result = runParser(errorCaptureParser, "-!> Unauthorized []");
      expect(result).to.deep.include({
        type: "ErrorCapture",
        errorName: "Unauthorized",
        optional: false,
        captures: [],
      });
      expect(result.errorParams).to.be.undefined;
    });

    it("should parse error capture with holes", () => {
      const result = runParser(
        errorCaptureParser,
        "-!> MyError(address,uint256,bool) [_ $amount _]",
      );
      expect(result).to.deep.include({
        type: "ErrorCapture",
        errorName: "MyError",
        errorParams: ["address", "uint256", "bool"],
        optional: false,
        captures: [null, "amount", null],
      });
    });

    it("should parse error capture with nested destructure", () => {
      const result = runParser(
        errorCaptureParser,
        "-!> TupleError(uint256,(address,uint256)) [$x [_ $y]]",
      );
      expect(result).to.deep.include({
        type: "ErrorCapture",
        errorName: "TupleError",
        errorParams: ["uint256", "(address,uint256)"],
        captures: ["x", [null, "y"]],
      });
    });

    it("should parse named error with empty parens and no capture", () => {
      const result = runParser(errorCaptureParser, "-!> Unauthorized()");
      expect(result).to.deep.include({
        type: "ErrorCapture",
        errorName: "Unauthorized",
        errorParams: [],
        optional: false,
        captures: [],
      });
      expect(result.boolVar).to.be.undefined;
    });

    it("should parse named error without parens and no capture", () => {
      const result = runParser(errorCaptureParser, "-!> Unauthorized");
      expect(result).to.deep.include({
        type: "ErrorCapture",
        errorName: "Unauthorized",
        optional: false,
        captures: [],
      });
      expect(result.errorParams).to.be.undefined;
      expect(result.boolVar).to.be.undefined;
    });

    it("should parse named error with bool var", () => {
      const result = runParser(errorCaptureParser, "-!> Unauthorized() $e");
      expect(result).to.deep.include({
        type: "ErrorCapture",
        errorName: "Unauthorized",
        errorParams: [],
        optional: false,
        captures: [],
        boolVar: "e",
      });
    });

    it("should parse optional named error with bool var", () => {
      const result = runParser(errorCaptureParser, "-?!> Unauthorized() $e");
      expect(result).to.deep.include({
        type: "ErrorCapture",
        errorName: "Unauthorized",
        errorParams: [],
        optional: true,
        captures: [],
        boolVar: "e",
      });
    });

    it("should parse named error with params and bool var", () => {
      const result = runParser(
        errorCaptureParser,
        "-?!> InsufficientBalance(uint256,uint256) $matched",
      );
      expect(result).to.deep.include({
        type: "ErrorCapture",
        errorName: "InsufficientBalance",
        errorParams: ["uint256", "uint256"],
        optional: true,
        captures: [],
        boolVar: "matched",
      });
    });

    it("should parse generic catch-all with bool var", () => {
      const result = runParser(errorCaptureParser, "-!> $e");
      expect(result).to.deep.include({
        type: "ErrorCapture",
        optional: false,
        captures: [],
        boolVar: "e",
      });
      expect(result.errorName).to.be.undefined;
    });

    it("should parse optional generic catch-all with bool var", () => {
      const result = runParser(errorCaptureParser, "-?!> $caught");
      expect(result).to.deep.include({
        type: "ErrorCapture",
        optional: true,
        captures: [],
        boolVar: "caught",
      });
      expect(result.errorName).to.be.undefined;
    });
  });

  describe("commandExpressionParser with error captures", () => {
    it("should parse exec with required error capture", () => {
      const result = runParser(
        commandExpressionParser,
        'exec $c "transfer(address,uint256)" @me 100e18 -!> InsufficientBalance(uint256,uint256) [$balance $required]',
      );
      expect(result.type).to.equal("CommandExpression");
      expect(result.name).to.equal("exec");
      expect(result.errorCaptures).to.have.lengthOf(1);
      expect(result.errorCaptures[0]).to.deep.include({
        type: "ErrorCapture",
        errorName: "InsufficientBalance",
        errorParams: ["uint256", "uint256"],
        optional: false,
        captures: ["balance", "required"],
      });
      expect(result.eventCaptures).to.be.undefined;
    });

    it("should parse exec with optional error capture", () => {
      const result = runParser(
        commandExpressionParser,
        'exec $c "transfer(address,uint256)" @me 100e18 -?!> Error(string) [$reason]',
      );
      expect(result.errorCaptures).to.have.lengthOf(1);
      expect(result.errorCaptures[0]).to.deep.include({
        type: "ErrorCapture",
        errorName: "Error",
        errorParams: ["string"],
        optional: true,
        captures: ["reason"],
      });
    });

    it("should parse exec with generic error capture", () => {
      const result = runParser(
        commandExpressionParser,
        'exec $c "doSomething()" -!> [$reason]',
      );
      expect(result.errorCaptures).to.have.lengthOf(1);
      expect(result.errorCaptures[0]).to.deep.include({
        type: "ErrorCapture",
        optional: false,
        captures: ["reason"],
      });
      expect(result.errorCaptures[0].errorName).to.be.undefined;
    });

    it("should parse exec without error captures (no errorCaptures property)", () => {
      const result = runParser(
        commandExpressionParser,
        "exec $c withdraw() 100",
      );
      expect(result.type).to.equal("CommandExpression");
      expect(result.errorCaptures).to.be.undefined;
    });

    it("should parse exec with error capture and comment", () => {
      const result = runParser(
        commandExpressionParser,
        'exec $c "transfer()" -!> Error(string) [$reason] # catch the error',
      );
      expect(result.errorCaptures).to.have.lengthOf(1);
      expect(result.errorCaptures[0]).to.deep.include({
        type: "ErrorCapture",
        errorName: "Error",
        errorParams: ["string"],
        captures: ["reason"],
      });
    });

    it("should parse batch with block expression followed by error capture", () => {
      const script = `batch (
  exec $c deposit() --value 1e18
  exec $c withdraw(uint) 1e18
) -!> Error(string) [$reason]`;

      const { ast, errors } = parseScript(script);
      expect(errors).to.have.lengthOf(0);

      const batchNode = ast.body[0] as CommandExpressionNode;
      expect(batchNode.type).to.equal("CommandExpression");
      expect(batchNode.name).to.equal("batch");
      expect(batchNode.args).to.have.lengthOf(1);
      expect(batchNode.errorCaptures).to.have.lengthOf(1);
      expect(batchNode.errorCaptures![0]).to.deep.include({
        type: "ErrorCapture",
        errorName: "Error",
        errorParams: ["string"],
        optional: false,
        captures: ["reason"],
      });
    });

    it("should parse exec with named error and no capture", () => {
      const result = runParser(
        commandExpressionParser,
        'exec $c "transfer(address,uint256)" @me 100e18 -!> Unauthorized()',
      );
      expect(result.errorCaptures).to.have.lengthOf(1);
      expect(result.errorCaptures[0]).to.deep.include({
        type: "ErrorCapture",
        errorName: "Unauthorized",
        errorParams: [],
        optional: false,
        captures: [],
      });
      expect(result.errorCaptures[0].boolVar).to.be.undefined;
    });

    it("should parse exec with named error and bool var", () => {
      const result = runParser(
        commandExpressionParser,
        'exec $c "transfer(address,uint256)" @me 100e18 -?!> Unauthorized() $e',
      );
      expect(result.errorCaptures).to.have.lengthOf(1);
      expect(result.errorCaptures[0]).to.deep.include({
        type: "ErrorCapture",
        errorName: "Unauthorized",
        errorParams: [],
        optional: true,
        captures: [],
        boolVar: "e",
      });
    });

    it("should parse exec with generic bool var error capture", () => {
      const result = runParser(
        commandExpressionParser,
        'exec $c "doSomething()" -?!> $reverted',
      );
      expect(result.errorCaptures).to.have.lengthOf(1);
      expect(result.errorCaptures[0]).to.deep.include({
        type: "ErrorCapture",
        optional: true,
        captures: [],
        boolVar: "reverted",
      });
      expect(result.errorCaptures[0].errorName).to.be.undefined;
    });
  });
});
