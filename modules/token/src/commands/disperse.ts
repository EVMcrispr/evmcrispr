import { defineCommand, ErrorException, encodeAction } from "@evmcrispr/sdk";
import { isRuntimeValue } from "@evmcrispr/sdk/onchain";
import { isAddress } from "viem";
import type Token from "..";

export default defineCommand<Token>({
  smartSupport: { kind: "runtime" },
  name: "disperse",
  description:
    "Transfer a token to multiple recipients, encoding one transfer per recipient.",
  args: [
    {
      name: "token",
      runtime: true,
      type: "address",
      description: "Token address",
    },
    {
      name: "recipients",
      runtime: true,
      type: "array",
      description: "Recipient addresses",
    },
    {
      name: "amounts",
      runtime: true,
      type: ["array", "number"],
      description:
        "Per-recipient amounts in token units (wei), or a single amount sent to every recipient",
    },
  ],
  async run(_module, { token, recipients, amounts }) {
    if (!Array.isArray(recipients))
      throw new ErrorException(
        "disperse requires a build-time recipient list; its elements may be runtime addresses",
      );
    const recipientList = recipients as unknown[];
    if (recipientList.length === 0) {
      throw new ErrorException("<recipients> must not be empty");
    }
    for (const recipient of recipientList) {
      if (
        !isRuntimeValue(recipient) &&
        (typeof recipient !== "string" || !isAddress(recipient))
      ) {
        throw new ErrorException(
          `<recipients> must contain addresses, got ${recipient}`,
        );
      }
    }

    const amountList = Array.isArray(amounts)
      ? amounts
      : recipientList.map(() => amounts);
    if (amountList.length !== recipientList.length) {
      throw new ErrorException(
        `<amounts> length (${amountList.length}) does not match <recipients> length (${recipientList.length})`,
      );
    }

    return recipientList.map((to, i) =>
      encodeAction(token, "transfer(address,uint256)", [
        to as string,
        amountList[i],
      ]),
    );
  },
});
