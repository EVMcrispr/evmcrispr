import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";

import {
  type CommandExpressionNode,
  ComparisonType,
  HelperFunctionError,
  type HelperFunctionNode,
  NodeType,
} from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import { getPublicClient, expectThrowAsync } from "@evmcrispr/test-utils";
import {
  createInterpreter,
  itChecksInvalidArgsLength,
  preparingExpression,
} from "../../test-helpers/evml";

const PINATA_JWT = process.env.VITE_PINATA_JWT;

const JWT_VAR_NAME = "ipfs.jwt";

const describeFn = PINATA_JWT ? describe : describe.skip;

describeFn("Std > helpers > @ipfs(text)", () => {

  let client: PublicClient;
  const lazyClient = () => client;
  const ipfsData = "This should be pinned in IPFS";

  beforeAll(async () => {
    client = getPublicClient();
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
