import { ErrorException } from "../../../errors";

import { defineCommand, encodeAction } from "../../../utils";
import type { Giveth } from "..";
import { givethDonationRelayer } from "../addresses";
import { _projectAddr } from "../helpers/projectAddr";

export default defineCommand<Giveth>({
  name: "donate",
  args: [
    { name: "slug", type: "string" },
    { name: "amount", type: "number" },
    { name: "tokenAddr", type: "address" },
  ],
  async run(module, { slug, amount, tokenAddr }) {
    const [projAddr, projectId] = await _projectAddr(module, slug);

    const chainId = await module.getChainId();

    if (!givethDonationRelayer.has(chainId)) {
      throw new ErrorException("network not supported by giveth");
    }

    return [
      encodeAction(tokenAddr, "approve(address,uint256)", [
        givethDonationRelayer.get(chainId)!,
        amount,
      ]),
      encodeAction(
        givethDonationRelayer.get(chainId)!,
        "sendDonation(address,address,uint256,uint256)",
        [tokenAddr, projAddr, amount, projectId],
      ),
    ];
  },
});
