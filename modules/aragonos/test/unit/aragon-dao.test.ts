import { describe, it } from "bun:test";
import { AddressMap, AddressSet } from "@evmcrispr/sdk";
import { expect } from "chai";
import { keccak256, toHex } from "viem";

import { AragonDAO } from "../../src/AragonDAO";
import type { App, AppArtifactCache, PermissionMap, Role } from "../../src/types";

function createMockApp(
  name: string,
  address: string,
  permissions: PermissionMap = new Map(),
): App {
  return {
    name,
    address: address as `0x${string}`,
    codeAddress: `0x${"cc".repeat(20)}` as `0x${string}`,
    contentUri: "",
    abi: [],
    permissions,
    registryName: "aragonpm.eth",
  };
}

function createMockDAO() {
  const kernelAddr = "0x1111111111111111111111111111111111111111";
  const agentAddr = "0x2222222222222222222222222222222222222222";
  const vaultAddr = "0x3333333333333333333333333333333333333333";
  const roleHash = keccak256(toHex("TRANSFER_ROLE"));
  const grantee = "0x4444444444444444444444444444444444444444" as `0x${string}`;
  const manager = "0x5555555555555555555555555555555555555555" as `0x${string}`;

  const agentPermissions: PermissionMap = new Map([
    [
      roleHash,
      {
        manager,
        grantees: new AddressSet([grantee]),
      } as Role,
    ],
  ]);

  const kernel = createMockApp("kernel", kernelAddr);
  const agent = createMockApp("agent", agentAddr, agentPermissions);
  const vault = createMockApp("vault", vaultAddr);

  const appCache = new Map<string, App>([
    ["kernel:0", kernel],
    ["agent:0", agent],
    ["vault:0", vault],
  ]);

  const appArtifactCache: AppArtifactCache = new AddressMap();

  return {
    dao: new AragonDAO(appCache, appArtifactCache, 1, "test-dao"),
    kernelAddr,
    agentAddr,
    vaultAddr,
    roleHash,
    grantee,
    manager,
  };
}

describe("AragonOS > AragonDAO", () => {
  describe("basic properties", () => {
    it("should return the kernel app", () => {
      const { dao, kernelAddr } = createMockDAO();
      expect(dao.kernel.name).to.equal("kernel");
      expect(dao.kernel.address).to.equal(kernelAddr);
    });

    it("should return the name", () => {
      const { dao } = createMockDAO();
      expect(dao.name).to.equal("test-dao");
    });

    it("should return the nesting index", () => {
      const { dao } = createMockDAO();
      expect(dao.nestingIndex).to.equal(1);
    });

    it("should expose the app cache", () => {
      const { dao } = createMockDAO();
      expect(dao.appCache.size).to.equal(3);
    });

    it("should expose the app artifact cache", () => {
      const { dao } = createMockDAO();
      expect(dao.appArtifactCache).to.be.instanceOf(AddressMap);
    });
  });

  describe("resolveApp()", () => {
    it("should resolve by name identifier", () => {
      const { dao } = createMockDAO();
      const app = dao.resolveApp("agent:0");
      expect(app).to.not.be.undefined;
      expect(app!.name).to.equal("agent");
    });

    it("should resolve by identifier without index (appends :0)", () => {
      const { dao } = createMockDAO();
      const app = dao.resolveApp("agent");
      expect(app).to.not.be.undefined;
      expect(app!.name).to.equal("agent");
    });

    it("should resolve by address", () => {
      const { dao, agentAddr } = createMockDAO();
      const app = dao.resolveApp(agentAddr);
      expect(app).to.not.be.undefined;
      expect(app!.name).to.equal("agent");
    });

    it("should return undefined for unknown identifiers", () => {
      const { dao } = createMockDAO();
      expect(dao.resolveApp("nonexistent:0")).to.be.undefined;
    });

    it("should return undefined for unknown addresses", () => {
      const { dao } = createMockDAO();
      expect(
        dao.resolveApp("0x9999999999999999999999999999999999999999"),
      ).to.be.undefined;
    });
  });

  describe("permissions", () => {
    it("getPermission() should return the role for an app", () => {
      const { dao, roleHash } = createMockDAO();
      const role = dao.getPermission("agent:0", "TRANSFER_ROLE");
      expect(role).to.not.be.undefined;
      expect(role).to.equal(dao.getPermission("agent:0", roleHash));
    });

    it("getPermission() should return undefined for non-existent role", () => {
      const { dao } = createMockDAO();
      expect(dao.getPermission("agent:0", "NON_EXISTENT")).to.be.undefined;
    });

    it("getPermission() should return undefined for non-existent app", () => {
      const { dao } = createMockDAO();
      expect(dao.getPermission("nonexistent:0", "TRANSFER_ROLE")).to.be
        .undefined;
    });

    it("hasPermission() should return true when grantee has the role", () => {
      const { dao, grantee } = createMockDAO();
      expect(dao.hasPermission(grantee, "agent:0", "TRANSFER_ROLE")).to.be.true;
    });

    it("hasPermission() should return false for unknown grantees", () => {
      const { dao } = createMockDAO();
      const unknown = "0x9999999999999999999999999999999999999999" as `0x${string}`;
      expect(dao.hasPermission(unknown, "agent:0", "TRANSFER_ROLE")).to.be
        .false;
    });

    it("hasPermissionManager() should return true when manager exists", () => {
      const { dao } = createMockDAO();
      expect(dao.hasPermissionManager("agent:0", "TRANSFER_ROLE")).to.be.true;
    });

    it("hasPermissionManager() should return false for non-existent role", () => {
      const { dao } = createMockDAO();
      expect(dao.hasPermissionManager("agent:0", "UNKNOWN_ROLE")).to.be.false;
    });

    it("getPermissionManager() should return the manager address", () => {
      const { dao, manager } = createMockDAO();
      expect(dao.getPermissionManager("agent:0", "TRANSFER_ROLE")).to.equal(
        manager,
      );
    });

    it("getPermissionManager() should return undefined for non-existent role", () => {
      const { dao } = createMockDAO();
      expect(dao.getPermissionManager("agent:0", "UNKNOWN_ROLE")).to.be
        .undefined;
    });

    it("getPermissions() should list all app permissions", () => {
      const { dao } = createMockDAO();
      const perms = dao.getPermissions();
      expect(perms).to.have.lengthOf(3);
      const agentPerms = perms.find(([name]) => name === "agent:0");
      expect(agentPerms).to.not.be.undefined;
      expect(agentPerms![1].size).to.equal(1);
    });
  });

  describe("clone()", () => {
    it("should return a new AragonDAO instance", () => {
      const { dao } = createMockDAO();
      const cloned = dao.clone();
      expect(cloned).to.not.equal(dao);
      expect(cloned.name).to.equal(dao.name);
      expect(cloned.nestingIndex).to.equal(dao.nestingIndex);
    });

    it("should have independent app caches", () => {
      const { dao } = createMockDAO();
      const cloned = dao.clone();
      expect(cloned.appCache).to.not.equal(dao.appCache);
      expect(cloned.appCache.size).to.equal(dao.appCache.size);
    });

    it("should share the artifact cache (by design)", () => {
      const { dao } = createMockDAO();
      const cloned = dao.clone();
      expect(cloned.appArtifactCache).to.equal(dao.appArtifactCache);
    });
  });
});
