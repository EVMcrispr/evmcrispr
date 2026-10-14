import {
  balanceChecks,
  type Candidate,
  contract,
  defineEvent,
  line,
  say,
} from "@evmcrispr/sdk";
import type { Address } from "viem";
import { netByAccount } from "./_shared";

export default defineEvent({
  name: "erc1155TransferSingle",
  description: "ERC-1155 transfers: a balance check per token id.",
  event:
    "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
  suggest: async (env, { emitter, logs }) => {
    const moves = logs as {
      id: bigint;
      from: Address;
      to: Address;
      value: bigint;
    }[];
    const collection = await contract(env, emitter, "token");
    const out: Candidate[] = [];
    for (const id of new Set(moves.map((m) => m.id))) {
      out.push(
        ...(await balanceChecks(
          env,
          netByAccount(moves.filter((m) => m.id === id)),
          (account) =>
            env.read(
              emitter,
              "function balanceOf(address,uint256) view returns (uint256)",
              [account, id],
            ),
          (who, op, value) => ({
            line: line`assert ${collection}::!{balanceOf(address,uint256)(uint256) ${who} ${id}} ${op} ${value}`,
            amount: say`${value} of token #${id} in ${collection}`,
          }),
        )),
      );
    }
    return out;
  },
});
