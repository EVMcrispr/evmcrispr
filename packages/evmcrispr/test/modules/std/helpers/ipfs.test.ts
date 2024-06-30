import { expect } from "chai";
import { viem } from "hardhat";

import type { PublicClient } from "viem";

import type {
  CommandExpressionNode,
  HelperFunctionNode,
} from "../../../../src/types";
import { NodeType } from "../../../../src/types";
import { ComparisonType } from "../../../../src/utils";
import { HelperFunctionError } from "../../../../src/errors";
import {
  createInterpreter,
  itChecksInvalidArgsLength,
  preparingExpression,
} from "../../../test-helpers/cas11";
import { expectThrowAsync } from "../../../test-helpers/expects";

const PINATA_JWT = process.env.VITE_PINATA_JWT;

const JWT_VAR_NAME = "ipfs.jwt";

describe("Std > helpers > @ipfs(text)", () => {
  if (!PINATA_JWT) {
    throw new Error("PINATA_JWT not defined in environment variables.");
  }

  let client: PublicClient;
  const lazyClient = () => client;
  const ipfsData = "This should be pinned in IPFS";

  before(async () => {
    client = await viem.getPublicClient();
  });

  it("should upload text to IPFS and return hash", async () => {
    const [interpret] = await preparingExpression(
      `@ipfs('${ipfsData}')`,
      client,
      undefined,
      [`set $std:${JWT_VAR_NAME} ${PINATA_JWT}`],
    );

    expect(await interpret()).to.equals(
      "QmeA34sMpR2EZfVdPsxYk7TMLxmQxhcgNer67UyTkiwKns",
    );
  });

  it("should fail when not setting pinata JWT variable", async () => {
    const interpreter = createInterpreter(
      `
        set $res @ipfs('some text')
      `,
      client,
    );
    const h = (interpreter.ast.body[0] as CommandExpressionNode)
      .args[1] as HelperFunctionNode;
    const error = new HelperFunctionError(
      h,
      "$std:ipfs.jwt is not defined. Go to pinata.cloud and obtain your API key, please",
    );

    await expectThrowAsync(async () => interpreter.interpret(), error);
  });

  it("should fail when setting an invalid pinata JWT", async () => {
    const interpreter = createInterpreter(
      `
        set $std:ipfs.jwt "an invalid JWT"
        set $res @ipfs("someText")
      `,
      client,
    );
    const h = (interpreter.ast.body[1] as CommandExpressionNode)
      .args[1] as HelperFunctionNode;
    const error = new HelperFunctionError(
      h,
      "an error occurred while uploading data to IPFS: Invalid/expired credentials",
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  itChecksInvalidArgsLength(
    NodeType.HelperFunctionExpression,
    "@ipfs",
    [`'${ipfsData}'`],
    { type: ComparisonType.Equal, minValue: 1 },
    lazyClient,
  );
});
