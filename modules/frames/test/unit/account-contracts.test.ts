import { describe, expect, test } from "bun:test";
import { concatHex, encodeAbiParameters, getContractAddress, pad } from "viem";
import {
  accountContracts,
  DETERMINISTIC_DEPLOYER,
  FACTORY_ADDRESS,
  IMPLEMENTATION_ADDRESS,
  predictAccountAddress,
} from "../../src/addresses";
import {
  frameAccountHegotaBytecode,
  frameSponsorBytecode,
  frameSponsorHegotaBytecode,
} from "../../src/contracts/artifacts";

const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const HEGOTA = 3151908;
const MINING = 81412;

describe("the frame account contracts of each network", () => {
  test("everywhere but the Hegota devnet: the addresses already deployed", () => {
    const contracts = accountContracts(MINING);
    expect(contracts.implementation).toBe(IMPLEMENTATION_ADDRESS);
    expect(contracts.factory).toBe(FACTORY_ADDRESS);
    expect(contracts.predictAccountAddress(OWNER, 0n)).toBe(
      predictAccountAddress(OWNER, 0n),
    );
    expect(contracts.sponsorBytecode).toBe(frameSponsorBytecode);
  });

  test("on the Hegota devnet: its own build (SIGDATACOPY at 0xba), at its own addresses", () => {
    const contracts = accountContracts(HEGOTA);
    expect(contracts.implementation).toBe(
      getContractAddress({
        opcode: "CREATE2",
        from: DETERMINISTIC_DEPLOYER,
        salt: pad("0x00", { size: 32 }),
        bytecode: frameAccountHegotaBytecode,
      }),
    );
    expect(contracts.implementation).not.toBe(IMPLEMENTATION_ADDRESS);
    expect(contracts.factory).not.toBe(FACTORY_ADDRESS);
    expect(contracts.predictAccountAddress(OWNER, 0n)).not.toBe(
      predictAccountAddress(OWNER, 0n),
    );
    expect(contracts.sponsorBytecode).toBe(frameSponsorHegotaBytecode);
    const [implementation, factory] = contracts.deploymentTransactions();
    expect(implementation!.data).toBe(
      concatHex([pad("0x00", { size: 32 }), frameAccountHegotaBytecode]),
    );
    expect(
      factory!.data.endsWith(
        encodeAbiParameters(
          [{ type: "address" }],
          [contracts.implementation],
        ).slice(2),
      ),
    ).toBe(true);
  });
});
