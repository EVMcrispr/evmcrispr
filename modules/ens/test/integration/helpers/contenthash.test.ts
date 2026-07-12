import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@ens:contenthash",
  {
    describeName: "Ens > helpers > @ens:contenthash(input)",
    module: "ens",
    docCases: [
      {
        description: "Encode an IPFS content hash",
        code: `set $hash @ens:contenthash("ipfs:QmRAQB6YaCyidP37UdDnjFY5vQuiBrcqdyoW1CuDgwxkD4")\nprint $hash`,
      },
    ],
    cases: [
      {
        name: "should encode an IPFS content hash",
        input:
          '@ens:contenthash("ipfs:QmRAQB6YaCyidP37UdDnjFY5vQuiBrcqdyoW1CuDgwxkD4")',
        validate: (result) => {
          expect(result).to.be.a("string");
          expect(result.startsWith("0x")).to.be.true;
          expect(result.length).to.be.greaterThan(2);
        },
      },
      {
        name: "should encode an IPNS content hash",
        input:
          '@ens:contenthash("ipns:k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v8")',
        validate: (result) => {
          expect(result).to.be.a("string");
          expect(result.startsWith("0xe5010172")).to.be.true;
        },
      },
      {
        name: "should produce deterministic output for the same input",
        input:
          '@ens:contenthash("ipfs:QmRAQB6YaCyidP37UdDnjFY5vQuiBrcqdyoW1CuDgwxkD4")',
        validate: (result) => {
          expect(result).to.be.a("string");
          expect(result).to.be.equal(
            "0xe3010170122029f2d17be6139079dc48696d1f582a8530eb9805b561eda517e22a892c7e3f1f",
          );
        },
      },
    ],
    errorCases: [
      {
        name: "should fail with an unsupported codec",
        input: '@ens:contenthash("arweave:abc123")',
        error: "Only ipfs, ipns and skynet are supported",
      },
      {
        name: "should fail when missing the colon separator",
        input: '@ens:contenthash("justahash")',
        error: "Only ipfs, ipns and skynet are supported",
      },
      {
        name: "should fail when hash is missing after the codec",
        input: '@ens:contenthash("ipfs:")',
        error: "The hash format should be <codec>:<hash>",
      },
    ],
    sampleArgs: ['"ipfs:QmRAQB6YaCyidP37UdDnjFY5vQuiBrcqdyoW1CuDgwxkD4"'],
  },
  helpers.contenthash.argDefs,
);
