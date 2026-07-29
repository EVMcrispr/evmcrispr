import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { ipfsGatewayFixtures } from "../../setup";

describeHelper(
  "@ipfs.get",
  {
    describeName: "Std > helpers > @ipfs.get(cid)",
    cases: [
      {
        name: "should return raw pinned text",
        input: `@ipfs.get("${ipfsGatewayFixtures.rawHex.cid}")`,
        expected: ipfsGatewayFixtures.rawHex.content,
      },
    ],
    errorCases: [
      {
        name: "should fail when the content is missing",
        input: `@ipfs.get("${ipfsGatewayFixtures.missing.cid}")`,
        error: "@ipfs.get: 404",
      },
    ],
    sampleArgs: [`"${ipfsGatewayFixtures.rawHex.cid}"`],
  },
  helpers["ipfs.get"].argDefs,
);
