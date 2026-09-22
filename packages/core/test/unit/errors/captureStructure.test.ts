import "../../setup";

import { describe, it } from "bun:test";
import type {
  CommandExpressionNode,
  ErrorCaptureNode,
  TxCaptureNode,
} from "@evmcrispr/sdk";
import { NodeType } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import type { CaptureContext } from "../../../src/errors/captureStructure";
import {
  captureStructureIssues,
  REVERT_CAPTURE_IN_BLOCK,
  SMART_BATCH_OPTIONAL_REVERT_CAPTURE,
  SMART_BATCH_REQUIRED_REVERT_CAPTURE,
  splitByTiming,
} from "../../../src/errors/captureStructure";

/** `-/>` / `-?/>` / `-!>` / `-?!>` as a bare clause node. */
function cap(
  arrow: "-/>" | "-?/>" | "-!>" | "-?!>",
  errorName?: string,
): ErrorCaptureNode {
  return {
    type: NodeType.ErrorCapture,
    timing: arrow.includes("/") ? "refusal" : "revert",
    optional: arrow.startsWith("-?"),
    errorName,
    captures: [],
  };
}

function tx(all = false): TxCaptureNode {
  return { type: NodeType.TxCapture, variable: "hash", all };
}

function command(
  name: string,
  captures: {
    errorCaptures?: ErrorCaptureNode[];
    txCaptures?: TxCaptureNode[];
  } = {},
): CommandExpressionNode {
  return {
    type: NodeType.CommandExpression,
    name,
    args: [],
    opts: [],
    ...captures,
  };
}

function issues(
  c: CommandExpressionNode,
  ctx: {
    blockCommand?: boolean;
    context?: CaptureContext;
    sendsNothing?: boolean;
  } = {},
) {
  return captureStructureIssues(c, {
    blockCommand: ctx.blockCommand ?? false,
    context: ctx.context ?? "execution",
    sendsNothing: ctx.sendsNothing,
  });
}

describe("Core > captureStructureIssues", () => {
  describe("mixed required timings", () => {
    it("refuses a required refusal and a required revert on one line", () => {
      const refusal = cap("-/>", "SameToken");
      const revert = cap("-!>", "Failure");
      const [issue, ...rest] = issues(
        command("exec", { errorCaptures: [refusal, revert] }),
      );
      expect(rest).to.be.empty;
      expect(issue!.code).to.equal("mixed-required-capture-timing");
      expect(issue!.node).to.equal(refusal);
      expect(issue!.message).to.equal(
        "a line cannot both refuse before sending (-/>) and revert after (-!>); keep one required timing",
      );
    });

    it("allows a required revert beside an optional refusal", () => {
      expect(
        issues(
          command("exec", {
            errorCaptures: [cap("-?/>", "SameToken"), cap("-!>", "Failure")],
          }),
        ),
      ).to.be.empty;
    });

    it("allows a required refusal beside an optional revert", () => {
      expect(
        issues(
          command("exec", {
            errorCaptures: [cap("-/>", "SameToken"), cap("-?!>", "Failure")],
          }),
        ),
      ).to.be.empty;
    });
  });

  describe("revert captures inside a collecting block", () => {
    it("refuses an optional revert capture", () => {
      const revert = cap("-?!>", "Failure");
      const [issue, ...rest] = issues(
        command("exec", { errorCaptures: [revert] }),
        { context: "collecting" },
      );
      expect(rest).to.be.empty;
      expect(issue!.code).to.equal("revert-capture-in-block");
      expect(issue!.node).to.equal(revert);
      expect(issue!.message).to.equal(REVERT_CAPTURE_IN_BLOCK);
      expect(REVERT_CAPTURE_IN_BLOCK).to.equal(
        "revert captures inside a block cannot observe the outer transaction; capture it on the block command instead",
      );
    });

    it("reports one issue per offending capture", () => {
      const first = cap("-!>", "A");
      const second = cap("-?!>", "B");
      const found = issues(
        command("exec", { errorCaptures: [first, second] }),
        { context: "collecting" },
      );
      expect(found.map((i) => i.node)).to.deep.equal([first, second]);
      expect(found.every((i) => i.code === "revert-capture-in-block")).to.be
        .true;
    });

    it("allows refusal captures", () => {
      expect(
        issues(
          command("exec", {
            errorCaptures: [cap("-/>", "A"), cap("-?/>", "B")],
          }),
          { context: "collecting" },
        ),
      ).to.be.empty;
    });
  });

  describe("revert captures inside a smart batch", () => {
    it("points a required revert capture at assert @reverts!", () => {
      const revert = cap("-!>", "Failure");
      const [issue, ...rest] = issues(
        command("exec", { errorCaptures: [revert] }),
        { context: "smart" },
      );
      expect(rest).to.be.empty;
      expect(issue!.code).to.equal("revert-capture-in-smart-batch");
      expect(issue!.node).to.equal(revert);
      expect(issue!.message).to.equal(SMART_BATCH_REQUIRED_REVERT_CAPTURE);
      expect(SMART_BATCH_REQUIRED_REVERT_CAPTURE).to.equal(
        "revert captures cannot observe a revert inside a smart batch; assert it instead: assert @reverts!(<target>::!{<signature>} -!> Name())",
      );
    });

    it("points an optional revert capture at if @reverts!", () => {
      const revert = cap("-?!>", "Failure");
      const [issue, ...rest] = issues(
        command("exec", { errorCaptures: [revert] }),
        { context: "smart" },
      );
      expect(rest).to.be.empty;
      expect(issue!.code).to.equal("revert-capture-in-smart-batch");
      expect(issue!.message).to.equal(SMART_BATCH_OPTIONAL_REVERT_CAPTURE);
      expect(SMART_BATCH_OPTIONAL_REVERT_CAPTURE).to.equal(
        "revert captures cannot catch a revert inside a smart batch; branch on it instead: if @reverts!(<target>::!{<signature>} -!> Name()) ( … )",
      );
    });

    it("allows refusal captures", () => {
      expect(
        issues(
          command("exec", {
            errorCaptures: [cap("-/>", "A"), cap("-?/>", "B")],
          }),
          { context: "smart" },
        ),
      ).to.be.empty;
    });
  });

  describe("revert captures on a line that sends nothing", () => {
    it("names the command and points at the refusal arrows", () => {
      const revert = cap("-?!>", "Failure");
      const [issue, ...rest] = issues(
        command("set", { errorCaptures: [revert] }),
        { sendsNothing: true },
      );
      expect(rest).to.be.empty;
      expect(issue!.code).to.equal("revert-capture-without-transaction");
      expect(issue!.node).to.equal(revert);
      expect(issue!.message).to.equal(
        '"set" sends no transaction, so a revert capture can never match; a refusal capture (-/>, -?/>) observes what it does before sending',
      );
    });

    it("allows refusal captures on the same line", () => {
      expect(
        issues(command("set", { errorCaptures: [cap("-?/>", "A")] }), {
          sendsNothing: true,
        }),
      ).to.be.empty;
    });
  });

  describe("the existing rules", () => {
    it("still refuses a tx capture beside a refusal capture", () => {
      const hash = tx();
      const [issue] = issues(
        command("exec", {
          txCaptures: [hash],
          errorCaptures: [cap("-?/>", "A")],
        }),
      );
      expect(issue!.code).to.equal("tx-capture-with-error-capture");
      expect(issue!.node).to.equal(hash);
    });

    it("still refuses a capture on a block command, listing all four arrows", () => {
      const refusal = cap("-?/>", "A");
      const [issue] = issues(command("if", { errorCaptures: [refusal] }), {
        blockCommand: true,
      });
      expect(issue!.code).to.equal("capture-on-block-command");
      expect(issue!.node).to.equal(refusal);
      for (const arrow of ["-/>", "-?/>", "-!>", "-?!>"])
        expect(issue!.message).to.include(arrow);
    });

    it("still refuses a duplicate tx capture", () => {
      const second = tx();
      const [issue] = issues(command("exec", { txCaptures: [tx(), second] }));
      expect(issue!.code).to.equal("duplicate-tx-capture");
      expect(issue!.node).to.equal(second);
    });
  });

  describe("splitByTiming", () => {
    it("keeps source order within each family", () => {
      const a = cap("-?/>", "A");
      const b = cap("-!>", "B");
      const c = cap("-/>", "C");
      const d = cap("-?!>", "D");
      expect(splitByTiming([a, b, c, d])).to.deep.equal({
        refusal: [a, c],
        revert: [b, d],
      });
    });

    it("returns empty families for no captures", () => {
      expect(splitByTiming([])).to.deep.equal({ refusal: [], revert: [] });
    });
  });
});
