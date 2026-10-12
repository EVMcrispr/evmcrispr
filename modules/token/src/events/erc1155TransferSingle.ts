import {
  type Candidate,
  contract,
  defineEvent,
  line,
  say,
} from "@evmcrispr/sdk";
import type { Address } from "viem";
import { balanceFloors, netByAccount } from "./_shared";

export default defineEvent({
  name: "erc1155TransferSingle",
  description: "ERC-1155 transfers: a balance floor per token id.",
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
        ...(await balanceFloors(
          env,
          netByAccount(moves.filter((m) => m.id === id)),
          (account) =>
            env.read(
              emitter,
              "function balanceOf(address,uint256) view returns (uint256)",
              [account, id],
            ),
          (who, floor) => ({
            line: line`assert ${collection}::!{balanceOf(address,uint256)(uint256) ${who} ${id}} >= ${floor}`,
            least: say`${floor} of token #${id} in ${collection}`,
          }),
        )),
      );
    }
    return out;
  },
});
