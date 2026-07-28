import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";

import type { ContractSource } from "../../src";
import { parseVerifiedSourceFiles, renderContractSource } from "../../src";

describe("parseVerifiedSourceFiles", () => {
  it("unwraps double-brace Standard JSON Input", () => {
    const standardJson = JSON.stringify({
      language: "Solidity",
      sources: {
        "contracts/Token.sol": { content: "contract Token {}" },
        "@openzeppelin/contracts/token/ERC20/ERC20.sol": {
          content: "contract ERC20 {}",
        },
      },
      settings: {},
    });
    const files = parseVerifiedSourceFiles({
      SourceCode: `{${standardJson}}`,
      ContractName: "Token",
    });
    expect(files).to.deep.equal({
      "contracts/Token.sol": "contract Token {}",
      "@openzeppelin/contracts/token/ERC20/ERC20.sol": "contract ERC20 {}",
    });
  });

  it("reads the legacy flat multi-file dict", () => {
    const files = parseVerifiedSourceFiles({
      SourceCode: JSON.stringify({
        "A.sol": { content: "contract A {}" },
        "B.sol": { content: "contract B {}" },
      }),
      ContractName: "A",
    });
    expect(files).to.deep.equal({
      "A.sol": "contract A {}",
      "B.sol": "contract B {}",
    });
  });

  it("wraps plain single-file Solidity under the contract name", () => {
    const files = parseVerifiedSourceFiles({
      SourceCode: "contract Single {}",
      ContractName: "Single",
    });
    expect(files).to.deep.equal({ "Single.sol": "contract Single {}" });
  });

  it("returns no files for an empty SourceCode", () => {
    expect(parseVerifiedSourceFiles({ SourceCode: "" })).to.deep.equal({});
  });
});

const SOURCE: ContractSource = {
  name: "Token",
  compilerVersion: "0.8.20+commit.a1b79de6",
  optimizationUsed: true,
  runs: 200,
  license: "MIT",
  isProxy: false,
  abi: [
    "function transfer(address to, uint256 amount) returns (bool)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
  ],
  files: {
    "contracts/Token.sol": "contract Token {}",
    "@openzeppelin/contracts/token/ERC20/ERC20.sol": "contract ERC20 {}",
  },
};

describe("renderContractSource", () => {
  it("renders an overview with ABI, files and settings", () => {
    const text = renderContractSource(SOURCE);
    expect(text).to.include("Token (verified on Etherscan)");
    expect(text).to.include("optimizer: 200 runs");
    expect(text).to.include("License: MIT");
    expect(text).to.include(
      "function transfer(address to, uint256 amount) returns (bool)",
    );
    expect(text).to.include("contracts/Token.sol");
    expect(text).to.not.include("proxy");
  });

  it("flags proxies with the implementation address", () => {
    const text = renderContractSource({
      ...SOURCE,
      isProxy: true,
      implementation: "0x1111111111111111111111111111111111111111",
    });
    expect(text).to.include(
      "proxy; its logic lives in the implementation at 0x1111111111111111111111111111111111111111",
    );
  });

  it("returns a file by exact path and by unique basename", () => {
    expect(
      renderContractSource(SOURCE, { file: "contracts/Token.sol" }),
    ).to.include("contract Token {}");
    expect(renderContractSource(SOURCE, { file: "ERC20.sol" })).to.include(
      "contract ERC20 {}",
    );
  });

  it("errors on unknown and ambiguous file names", () => {
    expect(renderContractSource(SOURCE, { file: "Nope.sol" })).to.include(
      'ERROR: no source file "Nope.sol"',
    );
    const ambiguous = renderContractSource(
      {
        ...SOURCE,
        files: {
          "a/Token.sol": "contract A {}",
          "b/Token.sol": "contract B {}",
        },
      },
      { file: "Token.sol" },
    );
    expect(ambiguous).to.include("ambiguous");
  });

  it("truncates at the character budget", () => {
    const text = renderContractSource(
      { ...SOURCE, files: { "Big.sol": "x".repeat(500) } },
      { file: "Big.sol", charBudget: 100 },
    );
    expect(text.length).to.be.lessThan(300);
    expect(text).to.include("[Truncated at 100 characters");
  });
});
