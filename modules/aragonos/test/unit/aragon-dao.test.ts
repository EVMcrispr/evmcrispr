import { describe, it } from "bun:test";
import { AddressSet } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { keccak256, toHex } from "viem";

import {
  cloneDao,
  countApps,
  type DaoContext,
  getKernel,
  getPermission,
  getPermissionManager,
  getPermissions,
  hasPermission,
  hasPermissionManager,
  resolveApp,
} from "../../src/dao";
import type { App, PermissionMap, Role } from "../../src/types";

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
  agent2Addr: string;
  vaultAddr: string;
  roleHash: string;
  grantee: `0x${string}`;
  manager: `0x${string}`;
} {
  const kernelAddr = "0x1111111111111111111111111111111111111111";
  const agentAddr = "0x2222222222222222222222222222222222222222";
  const agent2Addr = "0x6666666666666666666666666666666666666666";
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
  const agent2 = createMockApp("agent", agent2Addr);
  const vault = createMockApp("vault", vaultAddr);

  return {
    dao: {
      apps: [kernel, agent, agent2, vault],
      name: "test-dao",
    },
    kernelAddr,
    agentAddr,
    agent2Addr,
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

    it("should expose the apps list", () => {
      const { dao } = createMockDAO();
      expect(dao.apps).to.have.lengthOf(4);
    });
  });

  describe("resolveApp()", () => {
    it("should resolve by name", () => {
      const { dao, agentAddr } = createMockDAO();
      const app = resolveApp(dao, "agent");
      expect(app).to.not.be.undefined;
      expect(app!.address).to.equal(agentAddr);
    });

    it("should resolve a later instance by index", () => {
      const { dao, agent2Addr } = createMockDAO();
      const app = resolveApp(dao, "agent", 1);
      expect(app).to.not.be.undefined;
      expect(app!.address).to.equal(agent2Addr);
    });

    it("should resolve by address", () => {
      const { dao, agentAddr } = createMockDAO();
      const app = resolveApp(dao, agentAddr);
      expect(app).to.not.be.undefined;
      expect(app!.name).to.equal("agent");
    });

    it("should return undefined for out-of-range indexes", () => {
      const { dao } = createMockDAO();
      expect(resolveApp(dao, "agent", 2)).to.be.undefined;
    });

    it("should return undefined for unknown names", () => {
      const { dao } = createMockDAO();
      expect(resolveApp(dao, "nonexistent")).to.be.undefined;
    });

    it("should return undefined for unknown addresses", () => {
      const { dao } = createMockDAO();
      expect(resolveApp(dao, "0x9999999999999999999999999999999999999999")).to
        .be.undefined;
    });
  });

  describe("countApps()", () => {
    it("should count instances sharing a name", () => {
      const { dao } = createMockDAO();
      expect(countApps(dao, "agent")).to.equal(2);
      expect(countApps(dao, "vault")).to.equal(1);
      expect(countApps(dao, "nonexistent")).to.equal(0);
    });
  });

  describe("permissions", () => {
    it("getPermission() should return the role for an app", () => {
      const { dao, roleHash } = createMockDAO();
      const role = getPermission(dao, "agent", "TRANSFER_ROLE");
      expect(role).to.not.be.undefined;
      expect(role).to.equal(getPermission(dao, "agent", roleHash));
    });

    it("getPermission() should return undefined for non-existent role", () => {
      const { dao } = createMockDAO();
      expect(getPermission(dao, "agent", "NON_EXISTENT")).to.be.undefined;
    });

    it("getPermission() should return undefined for non-existent app", () => {
      const { dao } = createMockDAO();
      expect(getPermission(dao, "nonexistent", "TRANSFER_ROLE")).to.be
        .undefined;
    });

    it("hasPermission() should return true when grantee has the role", () => {
      const { dao, grantee } = createMockDAO();
      expect(hasPermission(dao, grantee, "agent", "TRANSFER_ROLE")).to.be.true;
    });

    it("hasPermission() should return false for unknown grantees", () => {
      const { dao } = createMockDAO();
      const unknown =
        "0x9999999999999999999999999999999999999999" as `0x${string}`;
      expect(hasPermission(dao, unknown, "agent", "TRANSFER_ROLE")).to.be.false;
    });

    it("hasPermissionManager() should return true when manager exists", () => {
      const { dao } = createMockDAO();
      expect(hasPermissionManager(dao, "agent", "TRANSFER_ROLE")).to.be.true;
    });

    it("hasPermissionManager() should return false for non-existent role", () => {
      const { dao } = createMockDAO();
      expect(hasPermissionManager(dao, "agent", "UNKNOWN_ROLE")).to.be.false;
    });

    it("getPermissionManager() should return the manager address", () => {
      const { dao, manager } = createMockDAO();
      expect(getPermissionManager(dao, "agent", "TRANSFER_ROLE")).to.equal(
        manager,
      );
    });

    it("getPermissionManager() should return undefined for non-existent role", () => {
      const { dao } = createMockDAO();
      expect(getPermissionManager(dao, "agent", "UNKNOWN_ROLE")).to.be
        .undefined;
    });

    it("getPermissions() should list permissions with display-ready identifiers", () => {
      const { dao } = createMockDAO();
      const perms = getPermissions(dao);
      expect(perms).to.have.lengthOf(4);
      expect(perms.map(([name]) => name)).to.eql([
        "kernel",
        "agent",
        "agent 1",
        "vault",
      ]);
      const agentPerms = perms.find(([name]) => name === "agent");
      expect(agentPerms![1].size).to.equal(1);
    });
  });

  describe("clone()", () => {
    it("should return a new DAO context", () => {
      const { dao } = createMockDAO();
      const cloned = cloneDao(dao);
      expect(cloned).to.not.equal(dao);
      expect(cloned.name).to.equal(dao.name);
    });

    it("should have independent app lists", () => {
      const { dao } = createMockDAO();
      const cloned = cloneDao(dao);
      expect(cloned.apps).to.not.equal(dao.apps);
      expect(cloned.apps).to.have.lengthOf(dao.apps.length);
    });
  });
});
