import { defineEvent, stateCandidate, truncateAddress } from "@evmcrispr/sdk";
import { getAddress } from "viem";

export default defineEvent({
  name: "erc721Approval",
  description: "ERC-721 approvals: who may move each token.",
  event:
    "event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)",
  suggest: async (env, { emitter, logs }) => {
    const last = new Map<bigint, string>();
    for (const { approved, tokenId } of logs)
      last.set(tokenId, getAddress(approved));
    const out = [];
    for (const [tokenId, approved] of last) {
      out.push(
        ...(await stateCandidate(
          env,
          {
            address: emitter,
            signature: "function getApproved(uint256) view returns (address)",
            args: [tokenId],
            expect: approved,
          },
          `assert ${emitter}::!{getApproved(uint256)(address) ${tokenId}} == ${approved}`,
          `${await env.tokenName(emitter)} #${tokenId} may be moved by ${truncateAddress(approved)}`,
        )),
      );
    }
    return out;
  },
});
