import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import {
  type Action,
  BindingsSpace,
  isTransactionAction,
  RevertError,
} from "@evmcrispr/sdk";
import { expect, getPublicClient, getTransports, getWalletClients, resetAnvil } from "@evmcrispr/test-utils";
import { evml, Interpreter } from "@evmcrispr/test-utils/evml";
import type { PublicClient, WalletClient } from "viem";
import { gnosis } from "viem/chains";

const { USER } = BindingsSpace;

/**
 * ErrorTestHarness creation bytecode (Solidity 0.8.24).
 *
 * Functions:
 *   transfer(address,uint256)  — require(false, "not enough tokens")
 *   withdraw(uint256 amount)   — revert InsufficientBalance(50, amount)
 *   deny()                     — revert Unauthorized()
 *   divideByZero()             — Panic(0x12) via 1/0
 *   revertEmpty()              — revert() with no data
 *   mint(uint256 amount)       — returns amount * 2 (succeeds)
 *
 * Custom errors:
 *   InsufficientBalance(uint256 available, uint256 required)
 *   Unauthorized()
 */
const CREATION_BYTECODE =
  "0x608060405234801561000f575f80fd5b506104eb8061001d5f395ff3fe608060405234801561000f575f80fd5b5060043610610060575f3560e01c806318bb613a146100645780632e1a7d4d146100825780634926c4c61461009e578063a0712d68146100a8578063a3fdfee3146100d8578063a9059cbb146100e2575b5f80fd5b61006c6100fe565b60405161007991906101ff565b60405180910390f35b61009c60048036038101906100979190610246565b610118565b005b6100a6610158565b005b6100c260048036038101906100bd9190610246565b61015c565b6040516100cf91906101ff565b60405180910390f35b6100e0610171565b005b6100fc60048036038101906100f791906102cb565b6101a3565b005b5f80600190505f80826101119190610363565b9250505090565b6032816040517fcf47918100000000000000000000000000000000000000000000000000000000815260040161014f9291906103d5565b60405180910390fd5b5f80fd5b5f60028261016a91906103fc565b9050919050565b6040517f82b4290000000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b5f6101e3576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016101da90610497565b60405180910390fd5b5050565b5f819050919050565b6101f9816101e7565b82525050565b5f6020820190506102125f8301846101f0565b92915050565b5f80fd5b610225816101e7565b811461022f575f80fd5b50565b5f813590506102408161021c565b92915050565b5f6020828403121561025b5761025a610218565b5b5f61026884828501610232565b91505092915050565b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f61029a82610271565b9050919050565b6102aa81610290565b81146102b4575f80fd5b50565b5f813590506102c5816102a1565b92915050565b5f80604083850312156102e1576102e0610218565b5b5f6102ee858286016102b7565b92505060206102ff85828601610232565b9150509250929050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52601260045260245ffd5b7f4e487b71000000000000000000000000000000000000000000000000000000005f52601160045260245ffd5b5f61036d826101e7565b9150610378836101e7565b92508261038857610387610309565b5b828204905092915050565b5f819050919050565b5f819050919050565b5f6103bf6103ba6103b584610393565b61039c565b6101e7565b9050919050565b6103cf816103a5565b82525050565b5f6040820190506103e85f8301856103c6565b6103f560208301846101f0565b9392505050565b5f610406826101e7565b9150610411836101e7565b925082820261041f816101e7565b9150828204841483151761043657610435610336565b5b5092915050565b5f82825260208201905092915050565b7f6e6f7420656e6f75676820746f6b656e730000000000000000000000000000005f82015250565b5f61048160118361043d565b915061048c8261044d565b602082019050919050565b5f6020820190508181035f8301526104ae81610475565b905091905056fea26469706673582212205e7d4f7a3cfa93d22a859ea0ccc6f1b95ccd3e6b476ded28d993fac8fa62e5c564736f6c63430008180033" as `0x${string}`;

let client: PublicClient;
let walletClient: WalletClient;
let contractAddress: string;

function createActionCallback(
  wc: WalletClient,
  pc: PublicClient,
): (action: Action) => Promise<any> {
  return async (action: Action) => {
    if (!isTransactionAction(action)) {
      throw new Error("Unexpected action type");
    }

    const hash = await wc.sendTransaction({
      account: wc.account!,
      chain: gnosis,
      to: action.to as `0x${string}`,
      data: action.data as `0x${string}`,
      value: action.value,
      gas: action.gas ?? 500_000n,
    });

    const receipt = await pc.waitForTransactionReceipt({ hash });

    if (receipt.status === "reverted") {
      let revertData: `0x${string}` | undefined;
      try {
        await pc.call({
          account: wc.account!.address,
          to: action.to as `0x${string}`,
          data: action.data as `0x${string}`,
          value: action.value,
        });
      } catch (callErr: any) {
        if (
          callErr?.data &&
          typeof callErr.data === "string" &&
          callErr.data.startsWith("0x")
        ) {
          revertData = callErr.data as `0x${string}`;
        } else if (typeof callErr?.walk === "function") {
          callErr.walk((inner: any) => {
            if (
              !revertData &&
              inner?.data &&
              typeof inner.data === "string" &&
              inner.data.startsWith("0x")
            ) {
              revertData = inner.data as `0x${string}`;
            }
          });
        }
      }
      throw new RevertError("Transaction reverted", revertData);
    }

    return receipt;
  };
}

function newEvm() {
  const evm = new Interpreter(evml.registry, { account: walletClient.account!.address, transports: getTransports() });
  evm.switchChainId(gnosis.id);
  return evm;
}

let actionCallback: (action: Action) => Promise<any>;

beforeAll(async () => {
  await resetAnvil();
  client = getPublicClient();
  walletClient = getWalletClients()[0];
  actionCallback = createActionCallback(walletClient, client);

  const deployHash = await walletClient.sendTransaction({
    account: walletClient.account!,
    chain: gnosis,
    data: CREATION_BYTECODE,
  });
  const receipt = await client.waitForTransactionReceipt({
    hash: deployHash,
  });
  contractAddress = receipt.contractAddress!;
});

// ── A. Named error types ─────────────────────────────────────────────

describe("Std > commands > exec > error capture", () => {
  describe("A — Named error types", () => {
    it("A1: should capture Error(string) from require", async () => {
      const evm = newEvm();
      await evm.interpret(
        `exec ${contractAddress} "transfer(address,uint256)" @me 100 -!> Error(string) [$reason]`,
        actionCallback,
      );
      expect(evm.getBinding("$reason", USER)).to.equal("not enough tokens");
    });

    it("A2: should capture custom error with args (InsufficientBalance)", async () => {
      const evm = newEvm();
      await evm.interpret(
        `exec ${contractAddress} "withdraw(uint256)" 200 -!> InsufficientBalance(uint256,uint256) [$balance $required]`,
        actionCallback,
      );
      expect(evm.getBinding("$balance", USER)).to.equal("50");
      expect(evm.getBinding("$required", USER)).to.equal("200");
    });

    it("A3: should match no-arg custom error with no capture (Unauthorized)", async () => {
      const evm = newEvm();
      await evm.interpret(
        `exec ${contractAddress} "deny()" -!> Unauthorized()`,
        actionCallback,
      );
    });

    it("A4: should capture Panic(uint256) from division by zero", async () => {
      const evm = newEvm();
      await evm.interpret(
        `exec ${contractAddress} "divideByZero()" -!> Panic(uint256) [$code]`,
        actionCallback,
      );
      expect(evm.getBinding("$code", USER)).to.equal("18");
    });

    it("A5: should capture empty revert with generic catch-all", async () => {
      const evm = newEvm();
      await evm.interpret(
        `exec ${contractAddress} "revertEmpty()" -!> [$reason]`,
        actionCallback,
      );
      const reason = evm.getBinding("$reason", USER) as string;
      expect(reason).to.be.a("string");
      expect(reason.length).to.be.greaterThan(0);
    });
  });

  // ── B. Optional -?!> ────────────────────────────────────────────────

  describe("B — Optional error capture (-?!>)", () => {
    it("B1: should capture normally when tx reverts", async () => {
      const evm = newEvm();
      await evm.interpret(
        `exec ${contractAddress} "transfer(address,uint256)" @me 100 -?!> Error(string) [$reason]`,
        actionCallback,
      );
      expect(evm.getBinding("$reason", USER)).to.equal("not enough tokens");
    });

    it("B2: should not fail and not set binding when tx succeeds", async () => {
      const evm = newEvm();
      await evm.interpret(
        `exec ${contractAddress} "mint(uint256)" 42 -?!> Error(string) [$reason]`,
        actionCallback,
      );
      expect(evm.getBinding("$reason", USER)).to.be.undefined;
    });

    it("B3: should set boolVar to true when named error matches", async () => {
      const evm = newEvm();
      await evm.interpret(
        `exec ${contractAddress} "deny()" -?!> Unauthorized() $e`,
        actionCallback,
      );
      expect(evm.getBinding("$e", USER)).to.equal("true");
    });

    it("B4: should set boolVar to false when tx succeeds", async () => {
      const evm = newEvm();
      await evm.interpret(
        `exec ${contractAddress} "mint(uint256)" 42 -?!> Unauthorized() $e`,
        actionCallback,
      );
      expect(evm.getBinding("$e", USER)).to.equal("false");
    });

    it("B5: should set boolVar to false on mismatched error", async () => {
      const evm = newEvm();
      await evm.interpret(
        `exec ${contractAddress} "transfer(address,uint256)" @me 100 -?!> Unauthorized() $e`,
        actionCallback,
      );
      expect(evm.getBinding("$e", USER)).to.equal("false");
    });
  });

  // ── C. Required -!> with bool var ───────────────────────────────────

  describe("C — Required error capture with bool var", () => {
    it("C1: should set boolVar to true when error matches", async () => {
      const evm = newEvm();
      await evm.interpret(
        `exec ${contractAddress} "transfer(address,uint256)" @me 100 -!> Error(string) $e`,
        actionCallback,
      );
      expect(evm.getBinding("$e", USER)).to.equal("true");
    });

    it("C2: should throw when tx succeeds (required)", async () => {
      const evm = newEvm();
      try {
        await evm.interpret(
          `exec ${contractAddress} "mint(uint256)" 42 -!> Error(string) $e`,
          actionCallback,
        );
        throw new Error("Expected to throw");
      } catch (err: any) {
        expect(err.message).to.include(
          "expected transaction to revert but it succeeded",
        );
      }
    });

    it("C3: should throw when tx succeeds (required, no capture)", async () => {
      const evm = newEvm();
      try {
        await evm.interpret(
          `exec ${contractAddress} "mint(uint256)" 42 -!> Unauthorized()`,
          actionCallback,
        );
        throw new Error("Expected to throw");
      } catch (err: any) {
        expect(err.message).to.include(
          "expected transaction to revert but it succeeded",
        );
      }
    });
  });

  // ── D. Generic catch-all ────────────────────────────────────────────

  describe("D — Generic catch-all", () => {
    it("D1: should decode Error(string) generically", async () => {
      const evm = newEvm();
      await evm.interpret(
        `exec ${contractAddress} "transfer(address,uint256)" @me 100 -!> [$reason]`,
        actionCallback,
      );
      expect(evm.getBinding("$reason", USER)).to.equal("not enough tokens");
    });

    it("D2: should decode Panic generically", async () => {
      const evm = newEvm();
      await evm.interpret(
        `exec ${contractAddress} "divideByZero()" -!> [$code]`,
        actionCallback,
      );
      expect(evm.getBinding("$code", USER)).to.equal("18");
    });

    it("D3: should set generic boolVar to true on any revert", async () => {
      const evm = newEvm();
      await evm.interpret(
        `exec ${contractAddress} "deny()" -!> $e`,
        actionCallback,
      );
      expect(evm.getBinding("$e", USER)).to.equal("true");
    });

    it("D4: should set optional generic boolVar to false on success", async () => {
      const evm = newEvm();
      await evm.interpret(
        `exec ${contractAddress} "mint(uint256)" 42 -?!> $e`,
        actionCallback,
      );
      expect(evm.getBinding("$e", USER)).to.equal("false");
    });
  });

  // ── E. Destructuring ───────────────────────────────────────────────

  describe("E — Destructuring patterns", () => {
    it("E1: should skip first arg with hole [_ $required]", async () => {
      const evm = newEvm();
      await evm.interpret(
        `exec ${contractAddress} "withdraw(uint256)" 200 -!> InsufficientBalance(uint256,uint256) [_ $required]`,
        actionCallback,
      );
      expect(evm.getBinding("$required", USER)).to.equal("200");
      expect(evm.getBinding("$balance", USER)).to.be.undefined;
    });

    it("E2: should discard all args with [_ _]", async () => {
      const evm = newEvm();
      await evm.interpret(
        `exec ${contractAddress} "withdraw(uint256)" 200 -!> InsufficientBalance(uint256,uint256) [_ _]`,
        actionCallback,
      );
    });
  });

  // ── F. Use captured values ──────────────────────────────────────────

  describe("F — Using captured values", () => {
    it("F1: should make captured error args available to subsequent commands", async () => {
      const evm = newEvm();
      await evm.interpret(
        [
          `exec ${contractAddress} "withdraw(uint256)" 200 -!> InsufficientBalance(uint256,uint256) [$balance $required]`,
          `set $copy $balance`,
        ].join("\n"),
        actionCallback,
      );
      expect(evm.getBinding("$balance", USER)).to.equal("50");
      expect(evm.getBinding("$required", USER)).to.equal("200");
      expect(evm.getBinding("$copy", USER)).to.equal("50");
    });
  });

  // ── H. Send command ─────────────────────────────────────────────────

  describe("H — Send command with error capture", () => {
    it("H1: should capture error from raw calldata", async () => {
      const evm = newEvm();
      await evm.interpret(
        `send ${contractAddress} --data 0xa3fdfee3 -!> Unauthorized()`,
        actionCallback,
      );
    });
  });

  // ── I. Mismatches ──────────────────────────────────────────────────

  describe("I — Error mismatches", () => {
    it("I1: should throw on wrong error name without boolVar", async () => {
      const evm = newEvm();
      try {
        await evm.interpret(
          `exec ${contractAddress} "transfer(address,uint256)" @me 100 -!> Unauthorized() []`,
          actionCallback,
        );
        throw new Error("Expected to throw");
      } catch (err: any) {
        expect(err.message).to.include("expected error");
      }
    });

    it("I2: should throw when named error expected but empty revert", async () => {
      const evm = newEvm();
      try {
        await evm.interpret(
          `exec ${contractAddress} "revertEmpty()" -!> InsufficientBalance(uint256,uint256) [$b $r]`,
          actionCallback,
        );
        throw new Error("Expected to throw");
      } catch (err: any) {
        expect(err.message).to.include("reverted with no data");
      }
    });
  });
});
