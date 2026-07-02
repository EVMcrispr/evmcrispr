import { describe, it } from "bun:test";
import { AddressMap, AddressSet } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { keccak256, toHex } from "viem";

import {
  cloneDao,
  type DaoContext,
  getKernel,
  getPermission,
  getPermissionManager,
  getPermissions,
  hasPermission,
  hasPermissionManager,
  resolveApp,
} from "../../src/dao";
import type {
  App,
  AppCache,
  AppResourceCache,
  PermissionMap,
  Role,
} from "../../src/types";

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

function createMockDAO(): {
  dao: DaoContext;
  kernelAddr: string;
  agentAddr: string;
  vaultAddr: string;
  roleHash: string;
  grantee: `0x${string}`;
  manager: `0x${string}`;
} {
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

  const appCache: AppCache = new Map([
    ["kernel:0", kernel],
    ["agent:0", agent],
    ["vault:0", vault],
  ]);

  const appResourceCache: AppResourceCache = new AddressMap();

  return {
    dao: {
      appCache,
      appResourceCache,
      nestingIndex: 1,
      name: "test-dao",
    },
    kernelAddr,
    agentAddr,
    vaultAddr,
    roleHash,
    grantee,
    manager,
  };
}

describe("AragonOS > DAO helpers", () => {
  describe("basic properties", () => {
    it("should return the kernel app", () => {
      const { dao, kernelAddr } = createMockDAO();
      expect(getKernel(dao).name).to.equal("kernel");
      expect(getKernel(dao).address).to.equal(kernelAddr);
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

    it("should expose the app resource cache", () => {
      const { dao } = createMockDAO();
      expect(dao.appResourceCache).to.be.instanceOf(AddressMap);
    });
  });

  describe("resolveApp()", () => {
    it("should resolve by name identifier", () => {
      const { dao } = createMockDAO();
      const app = resolveApp(dao, "agent:0");
      expect(app).to.not.be.undefined;
      expect(app!.name).to.equal("agent");
    });

    it("should resolve by identifier without index (appends :0)", () => {
      const { dao } = createMockDAO();
      const app = resolveApp(dao, "agent");
      expect(app).to.not.be.undefined;
      expect(app!.name).to.equal("agent");
    });

    it("should resolve by address", () => {
      const { dao, agentAddr } = createMockDAO();
      const app = resolveApp(dao, agentAddr);
      expect(app).to.not.be.undefined;
      expect(app!.name).to.equal("agent");
    });

    it("should return undefined for unknown identifiers", () => {
      const { dao } = createMockDAO();
      expect(resolveApp(dao, "nonexistent:0")).to.be.undefined;
    });

    it("should return undefined for unknown addresses", () => {
      const { dao } = createMockDAO();
      expect(resolveApp(dao, "0x9999999999999999999999999999999999999999")).to
        .be.undefined;
    });
  });

  describe("permissions", () => {
    it("getPermission() should return the role for an app", () => {
      const { dao, roleHash } = createMockDAO();
      const role = getPermission(dao, "agent:0", "TRANSFER_ROLE");
      expect(role).to.not.be.undefined;
      expect(role).to.equal(getPermission(dao, "agent:0", roleHash));
    });

    it("getPermission() should return undefined for non-existent role", () => {
      const { dao } = createMockDAO();
      expect(getPermission(dao, "agent:0", "NON_EXISTENT")).to.be.undefined;
    });

    it("getPermission() should return undefined for non-existent app", () => {
      const { dao } = createMockDAO();
      expect(getPermission(dao, "nonexistent:0", "TRANSFER_ROLE")).to.be
        .undefined;
    });

    it("hasPermission() should return true when grantee has the role", () => {
      const { dao, grantee } = createMockDAO();
      expect(hasPermission(dao, grantee, "agent:0", "TRANSFER_ROLE")).to.be
        .true;
    });

    it("hasPermission() should return false for unknown grantees", () => {
      const { dao } = createMockDAO();
      const unknown =
        "0x9999999999999999999999999999999999999999" as `0x${string}`;
      expect(hasPermission(dao, unknown, "agent:0", "TRANSFER_ROLE")).to.be
        .false;
    });

    it("hasPermissionManager() should return true when manager exists", () => {
      const { dao } = createMockDAO();
      expect(hasPermissionManager(dao, "agent:0", "TRANSFER_ROLE")).to.be.true;
    });

    it("hasPermissionManager() should return false for non-existent role", () => {
      const { dao } = createMockDAO();
      expect(hasPermissionManager(dao, "agent:0", "UNKNOWN_ROLE")).to.be.false;
    });

    it("getPermissionManager() should return the manager address", () => {
      const { dao, manager } = createMockDAO();
      expect(getPermissionManager(dao, "agent:0", "TRANSFER_ROLE")).to.equal(
        manager,
      );
    });

    it("getPermissionManager() should return undefined for non-existent role", () => {
      const { dao } = createMockDAO();
      expect(getPermissionManager(dao, "agent:0", "UNKNOWN_ROLE")).to.be
        .undefined;
    });

    it("getPermissions() should list all app permissions", () => {
      const { dao } = createMockDAO();
      const perms = getPermissions(dao);
      expect(perms).to.have.lengthOf(3);
      const agentPerms = perms.find(([name]) => name === "agent:0");
      expect(agentPerms).to.not.be.undefined;
      expect(agentPerms![1].size).to.equal(1);
    });
  });

  describe("clone()", () => {
    it("should return a new DAO context", () => {
      const { dao } = createMockDAO();
      const cloned = cloneDao(dao);
      expect(cloned).to.not.equal(dao);
      expect(cloned.name).to.equal(dao.name);
      expect(cloned.nestingIndex).to.equal(dao.nestingIndex);
    });

    it("should have independent app caches", () => {
      const { dao } = createMockDAO();
      const cloned = cloneDao(dao);
      expect(cloned.appCache).to.not.equal(dao.appCache);
      expect(cloned.appCache.size).to.equal(dao.appCache.size);
    });

    it("should share the resource cache (by design)", () => {
      const { dao } = createMockDAO();
      const cloned = cloneDao(dao);
      expect(cloned.appResourceCache).to.equal(dao.appResourceCache);
    });
  });
});
