import { defineHelper } from "@evmcrispr/sdk";
import { keccak256 } from "viem";
import type Assertions from "..";

export default defineHelper<Assertions>({
  name: "codehash",
  batchable: false,
  description:
    "Read the code hash of an address at script build time, with EXTCODEHASH semantics: `bytes32(0)` for a nonexistent account (zero nonce, balance and code), `keccak256` of the code otherwise. Matches what @codehash! reads on-chain at assertion time.",
  returnType: "bytes32",
  args: [{ name: "address", type: "address", description: "Address to read" }],
  async run(module, { address }) {
    const client = await module.getClient();
    const code = await client.getCode({ address });
    if (code && code !== "0x") return keccak256(code);
    // EXTCODEHASH distinguishes an existing code-less account (keccak256(""))
    // from a nonexistent one per EIP-161 (bytes32(0)).
    const [nonce, balance] = await Promise.all([
      client.getTransactionCount({ address }),
      client.getBalance({ address }),
    ]);
    if (nonce === 0 && balance === 0n)
      return "0x0000000000000000000000000000000000000000000000000000000000000000";
    return keccak256("0x");
  },
});
