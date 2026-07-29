import { describe, it } from "bun:test";
import { subgraphUrlFromChainId } from "@evmcrispr/module-aragonos/subgraph";
import {
  appDisplayName,
  decodeCallScript,
  encodeCallScript,
  isCallScript,
  isRepoIdentifier,
  normalizeRole,
  parseRepoIdentifier,
} from "@evmcrispr/module-aragonos/utils";
import { expect } from "@evmcrispr/test-utils";
import { keccak256, toHex } from "viem";

describe("AragonOS > utils > evmscripts", () => {
  const addr1 = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const addr2 = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  describe("encodeCallScript / decodeCallScript", () => {
    it("should encode and decode a single action", () => {
      const actions = [
        { to: addr1 as `0x${string}`, data: "0x11111111" as `0x${string}` },
      ];
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
      expect(() => decodeCallScript("0x00000002")).to.throw(
        "Not a call script",
      );
    });
  });
});

describe("AragonOS > utils > identifiers", () => {
  describe("isRepoIdentifier()", () => {
    it("should recognize valid repo identifiers", () => {
      expect(isRepoIdentifier("agent")).to.be.true;
      expect(isRepoIdentifier("token-manager")).to.be.true;
      expect(isRepoIdentifier("voting.open")).to.be.true;
    });

    it("should reject invalid identifiers", () => {
      expect(isRepoIdentifier("")).to.be.false;
      expect(isRepoIdentifier("$var")).to.be.false;
      expect(isRepoIdentifier("vault:1")).to.be.false;
      expect(isRepoIdentifier("agent:new")).to.be.false;
      expect(isRepoIdentifier("_mydao:agent")).to.be.false;
      expect(isRepoIdentifier("Vault")).to.be.false;
    });
  });

  describe("parseRepoIdentifier()", () => {
    it("should parse a bare repo name", () => {
      const [name, registry] = parseRepoIdentifier("agent");
      expect(name).to.equal("agent");
      expect(registry).to.equal("aragonpm.eth");
    });

    it("should parse a registry-qualified repo name", () => {
      const [name, registry] = parseRepoIdentifier("vault.open");
      expect(name).to.equal("vault");
      expect(registry).to.equal("open.aragonpm.eth");
    });

    it("should throw for invalid identifiers", () => {
      expect(() => parseRepoIdentifier("$invalid")).to.throw();
      expect(() => parseRepoIdentifier("vault:new")).to.throw();
    });
  });

  describe("appDisplayName()", () => {
    it("should return the bare name for default-registry apps", () => {
      expect(appDisplayName("agent", "aragonpm.eth")).to.equal("agent");
    });

    it("should qualify non-default registries", () => {
      expect(appDisplayName("vault", "open.aragonpm.eth")).to.equal(
        "vault.open",
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

describe("AragonOS > subgraph > subgraphUrlFromChainId", () => {
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
