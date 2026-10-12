import { type Candidate, defineEvent } from "@evmcrispr/sdk";
import { balanceFloors, netByAccount } from "./_shared";

export default defineEvent({
  name: "erc1155TransferSingle",
  description: "ERC-1155 transfers: a balance floor per token id.",
  event:
    "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
  suggest: async (env, { emitter, logs }) => {
    const ids = [...new Set(logs.map((l) => l.id as bigint))];
    const out: Candidate[] = [];
    for (const id of ids) {
      out.push(
        ...(await balanceFloors(
          env,
          netByAccount(logs.filter((l) => l.id === id) as never),
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
