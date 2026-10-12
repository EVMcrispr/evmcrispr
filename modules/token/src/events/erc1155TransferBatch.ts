import { type Candidate, defineEvent } from "@evmcrispr/sdk";
import { balanceFloors, netByAccount } from "./_shared";

export default defineEvent({
  name: "erc1155TransferBatch",
  description: "ERC-1155 batch transfers: a balance floor per token id.",
  event:
    "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
  suggest: async (env, { emitter, logs }) => {
    const moves = logs.flatMap((l) =>
      (l.ids as bigint[]).map((id, i) => ({
        id,
        from: l.from,
        to: l.to,
        value: (l.values as bigint[])[i],
      })),
    );
    const out: Candidate[] = [];
    for (const id of new Set(moves.map((m) => m.id))) {
      out.push(
        ...(await balanceFloors(
          env,
          netByAccount(moves.filter((m) => m.id === id)),
          (account) =>
            env.read(
              emitter,
              "function balanceOf(address,uint256) view returns (uint256)",
              [account, id],
            ),
          (account) =>
            `${emitter}::!{balanceOf(address,uint256)(uint256) ${account} ${id}}`,
          `${await env.tokenName(emitter)} #${id}`,
        )),
      );
    }
    return out;
  },
});
