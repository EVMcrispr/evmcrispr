import { defineEvent, stateCandidate, truncateAddress } from "@evmcrispr/sdk";
import { getAddress } from "viem";

export default defineEvent({
  name: "erc721Transfer",
  description: "ERC-721 transfers: who owns each token that moved.",
  event:
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  suggest: async (env, { emitter, logs }) => {
    const last = new Map<bigint, string>();
    for (const { to, tokenId } of logs) last.set(tokenId, getAddress(to));
    const name = await env.tokenName(emitter);
    const out = [];
    for (const [tokenId, owner] of last) {
      out.push(
        ...(await stateCandidate(
          env,
          {
            address: emitter,
            signature: "function ownerOf(uint256) view returns (address)",
            args: [tokenId],
            expect: owner,
          },
          `assert ${emitter}::!{ownerOf(uint256)(address) ${tokenId}} == ${owner}`,
          `${name} #${tokenId} is owned by ${truncateAddress(owner)}`,
        )),
      );
    }
    return out;
  },
});
