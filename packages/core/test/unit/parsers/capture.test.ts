import { describe, it } from "bun:test";
import type { CommandExpressionNode } from "@evmcrispr/sdk";
import { runParser } from "@evmcrispr/test-utils";
import { expect } from "chai";
import { eventCaptureParser } from "../../../src/parsers/capture";
import { commandExpressionParser } from "../../../src/parsers/command";
import { parseScript } from "../../../src/parsers/script";

describe("Parsers - event capture", () => {
  describe("eventCaptureParser", () => {
    it("should parse a simple event capture with implicit index 0", () => {
      const result = runParser(eventCaptureParser, "-> Withdrawn $amount");
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "Withdrawn",
        captures: [{ indexPath: [], variable: "amount" }],
      });
      expect(result.contractFilter).to.be.undefined;
      expect(result.eventParams).to.be.undefined;
      expect(result.occurrence).to.be.undefined;
    });

    it("should parse an event capture with explicit index", () => {
      const result = runParser(eventCaptureParser, "-> Withdrawn:1 $to");
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "Withdrawn",
        captures: [{ indexPath: [1], variable: "to" }],
      });
    });

    it("should parse an event capture with deep index path", () => {
      const result = runParser(
        eventCaptureParser,
        "-> ComplexEvent:1:0:2 $nested",
      );
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "ComplexEvent",
        captures: [{ indexPath: [1, 0, 2], variable: "nested" }],
      });
    });

    it("should parse an event capture with named field", () => {
      const result = runParser(eventCaptureParser, "-> Withdrawn .amount $amt");
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "Withdrawn",
        captures: [{ indexPath: [], fieldName: "amount", variable: "amt" }],
      });
    });

    it("should parse multiple capture bindings", () => {
      const result = runParser(
        eventCaptureParser,
        "-> Withdrawn $amount :1 $to",
      );
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "Withdrawn",
        captures: [
          { indexPath: [], variable: "amount" },
          { indexPath: [1], variable: "to" },
        ],
      });
    });

    it("should parse multiple named captures", () => {
      const result = runParser(
        eventCaptureParser,
        "-> Withdrawn .amount $amt .to $recipient",
      );
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "Withdrawn",
        captures: [
          { indexPath: [], fieldName: "amount", variable: "amt" },
          { indexPath: [], fieldName: "to", variable: "recipient" },
        ],
      });
    });

    it("should parse occurrence selector", () => {
      const result = runParser(eventCaptureParser, "-> Transfer#1 $amount");
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "Transfer",
        occurrence: 1,
        captures: [{ indexPath: [], variable: "amount" }],
      });
    });

    it("should parse inline event params", () => {
      const result = runParser(
        eventCaptureParser,
        "-> Withdrawn(uint256,address) $amount",
      );
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "Withdrawn",
        eventParams: ["uint256", "address"],
        captures: [{ indexPath: [], variable: "amount" }],
      });
    });

    it("should parse inline event params with index", () => {
      const result = runParser(
        eventCaptureParser,
        "-> Withdrawn(uint256,address):1 $to",
      );
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "Withdrawn",
        eventParams: ["uint256", "address"],
        captures: [{ indexPath: [1], variable: "to" }],
      });
    });

    it("should parse inline event params with occurrence", () => {
      const result = runParser(
        eventCaptureParser,
        "-> Swapped(uint256,uint256)#1 $amount",
      );
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "Swapped",
        eventParams: ["uint256", "uint256"],
        occurrence: 1,
        captures: [{ indexPath: [], variable: "amount" }],
      });
    });

    it("should parse contract filter with variable", () => {
      const result = runParser(
        eventCaptureParser,
        "-> $token:Transfer $amount",
      );
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "Transfer",
        captures: [{ indexPath: [], variable: "amount" }],
      });
      expect(result.contractFilter).to.deep.include({
        type: "VariableIdentifier",
        value: "$token",
      });
    });

    it("should parse contract filter with address literal", () => {
      const result = runParser(
        eventCaptureParser,
        "-> 0x9C33eaCc2F50E39940D3AfaF2c7B8246B681A374:Transfer $amount",
      );
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "Transfer",
        captures: [{ indexPath: [], variable: "amount" }],
      });
      expect(result.contractFilter).to.deep.include({
        type: "AddressLiteral",
        value: "0x9C33eaCc2F50E39940D3AfaF2c7B8246B681A374",
      });
    });

    it("should parse contract filter with inline params and index", () => {
      const result = runParser(
        eventCaptureParser,
        "-> $c:Withdrawn(uint256,address):1 $to",
      );
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "Withdrawn",
        eventParams: ["uint256", "address"],
        captures: [{ indexPath: [1], variable: "to" }],
      });
      expect(result.contractFilter).to.deep.include({
        type: "VariableIdentifier",
        value: "$c",
      });
    });

    it("should parse inline tuple event params", () => {
      const result = runParser(
        eventCaptureParser,
        "-> MyEvent(uint256,(address,uint256)[]) $val",
      );
      expect(result).to.deep.include({
        type: "EventCapture",
        eventName: "MyEvent",
        eventParams: ["uint256", "(address,uint256)[]"],
        captures: [{ indexPath: [], variable: "val" }],
      });
    });
  });

  describe("commandExpressionParser with event captures", () => {
    it("should parse exec with single event capture", () => {
      const result = runParser(
        commandExpressionParser,
        "exec $c withdraw() -> Withdrawn $amount",
      );
      expect(result.type).to.equal("CommandExpression");
      expect(result.name).to.equal("exec");
      expect(result.eventCaptures).to.have.lengthOf(1);
      expect(result.eventCaptures[0]).to.deep.include({
        type: "EventCapture",
        eventName: "Withdrawn",
        captures: [{ indexPath: [], variable: "amount" }],
      });
    });

    it("should parse exec with multiple event captures", () => {
      const result = runParser(
        commandExpressionParser,
        "exec $c swap() -> TokensWithdrawn $a -> TokensDeposited $b",
      );
      expect(result.type).to.equal("CommandExpression");
      expect(result.name).to.equal("exec");
      expect(result.eventCaptures).to.have.lengthOf(2);
      expect(result.eventCaptures[0]).to.deep.include({
        type: "EventCapture",
        eventName: "TokensWithdrawn",
      });
      expect(result.eventCaptures[1]).to.deep.include({
        type: "EventCapture",
        eventName: "TokensDeposited",
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

    it("should parse exec with inline event signature", () => {
      const result = runParser(
        commandExpressionParser,
        "exec $c withdraw() -> Withdrawn(uint256,address):1 $to",
      );
      expect(result.eventCaptures).to.have.lengthOf(1);
      expect(result.eventCaptures[0]).to.deep.include({
        type: "EventCapture",
        eventName: "Withdrawn",
        eventParams: ["uint256", "address"],
        captures: [{ indexPath: [1], variable: "to" }],
      });
    });

    it("should parse exec with contract filter", () => {
      const result = runParser(
        commandExpressionParser,
        "exec $c withdraw() -> $c:Withdrawn $amount",
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
        "exec $c withdraw() -> Withdrawn $amount # capture the amount",
      );
      expect(result.eventCaptures).to.have.lengthOf(1);
      expect(result.eventCaptures[0]).to.deep.include({
        type: "EventCapture",
        eventName: "Withdrawn",
        captures: [{ indexPath: [], variable: "amount" }],
      });
    });

    it("should parse batch with block expression followed by event capture", () => {
      const script = `batch (
  exec $c deposit() --value 1e18
  exec $c withdraw(uint) 1e18
) -> Deposit(address,uint):1 $amount`;

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
        captures: [{ indexPath: [1], variable: "amount" }],
      });
    });
  });
});
