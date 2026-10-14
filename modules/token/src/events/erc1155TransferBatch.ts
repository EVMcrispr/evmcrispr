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
  name: "erc1155TransferBatch",
  description: "ERC-1155 batch transfers: a balance check per token id.",
  event:
    "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
  suggest: async (env, { emitter, logs }) => {
    const moves = logs.flatMap((l) =>
      (l.ids as bigint[]).map((id, i) => ({
        id,
        from: l.from as Address,
        to: l.to as Address,
        value: (l.values as bigint[])[i],
      })),
    );
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
