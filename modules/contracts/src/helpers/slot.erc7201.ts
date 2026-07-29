import { defineHelper } from "@evmcrispr/sdk";
import { encodeAbiParameters, keccak256, toHex } from "viem";
import type Contracts from "..";

export default defineHelper<Contracts>({
  name: "slot.erc7201",
  description:
    "Derive the root slot of an ERC-7201 namespaced storage layout: keccak256(abi.encode(uint256(keccak256(id)) - 1)) & ~0xff.",
  returnType: "bytes32",
  args: [
    {
      name: "id",
      type: "string",
      description: 'Namespace id, e.g. "openzeppelin.storage.Ownable"',
    },
  ],
  async run(_, { id }) {
    const inner = BigInt.asUintN(
      256,
      BigInt(keccak256(toHex(String(id)))) - 1n,
    );
    const outer = BigInt(
      keccak256(encodeAbiParameters([{ type: "uint256" }], [inner])),
    );
    return toHex(outer & ~0xffn, { size: 32 });
  },
});
