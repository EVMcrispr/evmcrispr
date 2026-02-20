import "../../setup";
import { describeHelper, expect } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@contenthash",
  {
    describeName: "Ens > helpers > @contenthash(input)",
    module: "ens",
    cases: [
      {
        name: "should encode an IPFS content hash",
        input:
          '@contenthash("ipfs:QmRAQB6YaCyidP37UdDnjFY5vQuiBrcqdyoW1CuDgwxkD4")',
        validate: (result) => {
          expect(result).to.be.a("string");
          expect(result.startsWith("0x")).to.be.true;
          expect(result.length).to.be.greaterThan(2);
        },
      },
      {
        name: "should encode an IPNS content hash",
        input: '@contenthash("ipns:k51qzi5uqu5dgccx524mfjv0x5hqgznkzq")',
        validate: (result) => {
          expect(result).to.be.a("string");
          expect(result.startsWith("0x")).to.be.true;
        },
      },
      {
        name: "should produce deterministic output for the same input",
        input:
          '@contenthash("ipfs:QmRAQB6YaCyidP37UdDnjFY5vQuiBrcqdyoW1CuDgwxkD4")',
        validate: (result) => {
          expect(result).to.be.a("string");
          expect(result).to.be.equal(
            "0x00000000000000000000516d52415142365961437969645033375564446e6a465935765175694272637164796f57314375446777786b4434",
          );
        },
      },
    ],
    errorCases: [
      {
        name: "should fail with an unsupported codec",
        input: '@contenthash("arweave:abc123")',
        error: "Only ipfs, ipns and skynet are supported",
      },
      {
        name: "should fail when missing the colon separator",
        input: '@contenthash("justahash")',
        error: "Only ipfs, ipns and skynet are supported",
      },
      {
        name: "should fail when hash is missing after the codec",
        input: '@contenthash("ipfs:")',
        error: "The hash format should be <codec>:<hash>",
      },
    ],
    sampleArgs: ['"ipfs:QmRAQB6YaCyidP37UdDnjFY5vQuiBrcqdyoW1CuDgwxkD4"'],
  },
  helpers.contenthash.argDefs,
);
