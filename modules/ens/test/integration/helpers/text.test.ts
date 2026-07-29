import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@ens:text",
  {
    describeName: "Ens > helpers > @ens:text(name, key)",
    module: "ens",
    cases: [
      {
        name: "should read a text record",
        input: `@ens:text("vitalik.eth" "url")`,
        validate: (result) => {
          expect(result).to.be.a("string");
          expect(result.length).to.be.greaterThan(0);
        },
      },
    ],
    docCases: [
      {
        description: "Read a URL text record",
        code: `set $url @ens:text("vitalik.eth" "url")\nprint $url`,
      },
      {
        description: "Read a Twitter handle",
        code: `set $twitter @ens:text("vitalik.eth" "com.twitter")\nprint $twitter`,
      },
    ],
    errorCases: [
      {
        name: "should fail when the text record does not exist",
        input: `@ens:text("vitalik.eth" "nonexistent-key-xyz")`,
        error: "no text record",
      },
    ],
    sampleArgs: ['"vitalik.eth"', '"url"'],
  },
  helpers.text.argDefs,
);
