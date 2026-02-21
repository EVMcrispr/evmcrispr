import { describe, it } from "bun:test";
import { expect } from "chai";
import { keccak256, toHex } from "viem";

import {
  encodeCallScript,
  decodeCallScript,
  isCallScript,
  resolveIdentifier,
  isAppIdentifier,
  isLabeledAppIdentifier,
  buildAppIdentifier,
  parseLabeledAppIdentifier,
  formatAppIdentifier,
  parsePrefixedDAOIdentifier,
  createDaoPrefixedIdentifier,
  normalizeRole,
} from "@evmcrispr/module-aragonos/utils";
import { subgraphUrlFromChainId } from "@evmcrispr/module-aragonos/Connector";

describe("AragonOS > utils > evmscripts", () => {
  const addr1 = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const addr2 = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  describe("encodeCallScript / decodeCallScript", () => {
    it("should encode and decode a single action", () => {
      const actions = [{ to: addr1 as `0x${string}`, data: "0x11111111" as `0x${string}` }];
      const encoded = encodeCallScript(actions);
      expect(encoded.startsWith("0x00000001")).to.be.true;

      const decoded = decodeCallScript(encoded);
      expect(decoded).to.have.lengthOf(1);
      expect(decoded[0].to.toLowerCase()).to.equal(addr1);
      expect(decoded[0].data).to.equal("0x11111111");
    });

    it("should encode and decode multiple actions", () => {
      const actions = [
        { to: addr1 as `0x${string}`, data: "0x11111111" as `0x${string}` },
        { to: addr2 as `0x${string}`, data: "0x2222222222" as `0x${string}` },
      ];
      const encoded = encodeCallScript(actions);
      const decoded = decodeCallScript(encoded);
      expect(decoded).to.have.lengthOf(2);
      expect(decoded[0].to.toLowerCase()).to.equal(addr1);
      expect(decoded[1].to.toLowerCase()).to.equal(addr2);
      expect(decoded[1].data).to.equal("0x2222222222");
    });

    it("should roundtrip empty actions", () => {
      const encoded = encodeCallScript([]);
      expect(encoded).to.equal("0x00000001");
      expect(isCallScript(encoded)).to.be.true;
    });
  });

  describe("isCallScript()", () => {
    it("should return true for valid callscript prefix", () => {
      expect(isCallScript("0x00000001abcdef")).to.be.true;
    });

    it("should return false for other prefixes", () => {
      expect(isCallScript("0x00000002abcdef")).to.be.false;
      expect(isCallScript("0xdeadbeef")).to.be.false;
    });
  });

  describe("decodeCallScript()", () => {
    it("should throw for non-callscript input", () => {
      expect(() => decodeCallScript("0x00000002")).to.throw("Not a call script");
    });
  });
});

describe("AragonOS > utils > identifiers", () => {
  describe("isAppIdentifier()", () => {
    it("should recognize valid app identifiers", () => {
      expect(isAppIdentifier("agent")).to.be.true;
      expect(isAppIdentifier("token-manager")).to.be.true;
      expect(isAppIdentifier("vault:1")).to.be.true;
      expect(isAppIdentifier("voting.open:0")).to.be.true;
    });

    it("should reject invalid identifiers", () => {
      expect(isAppIdentifier("")).to.be.false;
      expect(isAppIdentifier("$var")).to.be.false;
    });
  });

  describe("isLabeledAppIdentifier()", () => {
    it("should recognize labeled identifiers", () => {
      expect(isLabeledAppIdentifier("agent:new")).to.be.true;
      expect(isLabeledAppIdentifier("vault.open:main")).to.be.true;
      expect(isLabeledAppIdentifier("agent:0")).to.be.true;
      expect(isLabeledAppIdentifier("_mydao:agent:0")).to.be.true;
    });
  });

  describe("resolveIdentifier()", () => {
    it("should append :0 to bare identifiers", () => {
      expect(resolveIdentifier("agent")).to.equal("agent:0");
    });

    it("should keep identifiers with explicit index", () => {
      expect(resolveIdentifier("agent:1")).to.equal("agent:1");
    });

    it("should handle labeled identifiers", () => {
      expect(resolveIdentifier("_dao:agent:0")).to.equal("_dao:agent:0");
    });

    it("should throw for invalid identifiers", () => {
      expect(() => resolveIdentifier("$invalid")).to.throw();
    });
  });

  describe("buildAppIdentifier()", () => {
    it("should build an identifier from app name and counter", () => {
      const app = { name: "agent", registryName: "aragonpm.eth" } as any;
      expect(buildAppIdentifier(app, 0)).to.equal("agent:0");
    });

    it("should include non-default registry", () => {
      const app = { name: "vault", registryName: "open.aragonpm.eth" } as any;
      expect(buildAppIdentifier(app, 1)).to.equal("vault.open:1");
    });
  });

  describe("parseLabeledAppIdentifier()", () => {
    it("should parse a simple labeled identifier", () => {
      const [name, registry, label] = parseLabeledAppIdentifier("agent:0");
      expect(name).to.equal("agent");
      expect(label).to.equal("0");
      expect(registry).to.equal("aragonpm.eth");
    });

    it("should throw for invalid labeled identifiers", () => {
      expect(() => parseLabeledAppIdentifier("$invalid")).to.throw();
    });
  });

  describe("formatAppIdentifier()", () => {
    it("should strip :0 suffix", () => {
      expect(formatAppIdentifier("agent:0")).to.equal("agent");
    });

    it("should keep non-zero indexes", () => {
      expect(formatAppIdentifier("agent:1")).to.equal("agent:1");
    });
  });

  describe("parsePrefixedDAOIdentifier()", () => {
    it("should parse a DAO-prefixed identifier", () => {
      const [dao, appId] = parsePrefixedDAOIdentifier("_myDao:agent");
      expect(dao).to.equal("myDao");
      expect(appId).to.equal("agent");
    });

    it("should return undefined DAO for unprefixed identifiers", () => {
      const [dao, appId] = parsePrefixedDAOIdentifier("agent");
      expect(dao).to.be.undefined;
      expect(appId).to.equal("agent");
    });
  });

  describe("createDaoPrefixedIdentifier()", () => {
    it("should create a DAO-prefixed identifier", () => {
      expect(createDaoPrefixedIdentifier("agent:0", "myDao")).to.equal(
        "_myDao:agent:0",
      );
    });
  });
});

describe("AragonOS > utils > normalizeRole", () => {
  it("should return the hash for a role name string", () => {
    const result = normalizeRole("TRANSFER_ROLE");
    expect(result).to.equal(keccak256(toHex("TRANSFER_ROLE")));
  });

  it("should pass through a valid bytes32 hash", () => {
    const hash = keccak256(toHex("TEST_ROLE"));
    expect(normalizeRole(hash)).to.equal(hash);
  });

  it("should throw for an invalid hex hash (wrong length)", () => {
    expect(() => normalizeRole("0xdeadbeef")).to.throw();
  });
});

describe("AragonOS > Connector > subgraphUrlFromChainId", () => {
  it("should return a URL for Ethereum mainnet (1)", () => {
    const url = subgraphUrlFromChainId(1);
    expect(url).to.include("thegraph.com");
  });

  it("should return a URL for Optimism (10)", () => {
    const url = subgraphUrlFromChainId(10);
    expect(url).to.include("thegraph.com");
  });

  it("should return a URL for Gnosis (100)", () => {
    const url = subgraphUrlFromChainId(100);
    expect(url).to.include("thegraph.com");
  });

  it("should throw for unsupported chain IDs", () => {
    expect(() => subgraphUrlFromChainId(999)).to.throw(/No subgraph found/);
  });
});
