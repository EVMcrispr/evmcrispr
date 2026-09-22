import {
  defineCommand,
  ErrorException,
  encodeAction,
  type Param,
} from "@evmcrispr/sdk";
import {
  assertSmartComparison,
  forEachSmartArray,
  getSmartCompileContext,
  isRuntimeValue,
  smartArrayLength,
  smartIterationLimit,
  smartValueElement,
  snapshotSmartValue,
} from "@evmcrispr/sdk/onchain";
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
  opts: [
    {
      name: "max-recipients",
      type: "number",
      description:
        "Maximum recipients for a runtime array (default 32, at most 256); exceeding it reverts the batch",
    },
  ],
  async run(module, { token, recipients, amounts }, { opts, node }) {
    if (isRuntimeValue(recipients) && recipients.abiType.type === "address[]") {
      const count = smartArrayLength(module, recipients);
      await assertSmartComparison(
        module,
        count,
        ">",
        0n,
        "disperse recipients must not be empty",
      );
      const arrayAmounts =
        isRuntimeValue(amounts) && /\[\d*\]$/.test(amounts.abiType.type);
      if (arrayAmounts || Array.isArray(amounts)) {
        const n = arrayAmounts
          ? smartArrayLength(module, amounts)
          : BigInt(amounts.length);
        await assertSmartComparison(
          module,
          count,
          ">=",
          n,
          "disperse amounts length does not match recipients",
        );
        await assertSmartComparison(
          module,
          count,
          "<=",
          n,
          "disperse amounts length does not match recipients",
        );
      }
      const state =
        getSmartCompileContext(module)!.interpreters.batchContext!.smartState!;
      await forEachSmartArray(
        module,
        recipients,
        Array.isArray(amounts)
          ? Math.min(
              amounts.length,
              smartIterationLimit(opts["max-recipients"]),
            )
          : smartIterationLimit(opts["max-recipients"]),
        async ([to, amount]) => {
          await state.append(module, node, {
            actions: [
              encodeAction(token, "transfer(address,uint256)", [to, amount]),
            ],
          });
        },
        async (to, i) => [
          to,
          await snapshotSmartValue(
            module,
            arrayAmounts
              ? smartValueElement(module, amounts, i)
              : Array.isArray(amounts)
                ? amounts[i]
                : amounts,
          ),
        ],
      );
      return [];
    }
    if (isRuntimeValue(recipients)) {
      const length = recipients.abiType.type.match(/^address\[(\d+)\]$/)?.[1];
      if (length && Number(length) <= 10_000) {
        const source = recipients;
        recipients = Array.from({ length: Number(length) }, (_, i) =>
          smartValueElement(module, source, i),
        );
      }
    }
    if (!Array.isArray(recipients))
      throw new ErrorException(
        "disperse requires a build-time recipient list; its elements may be runtime addresses",
      );
    const recipientList = (await snapshotSmartValue(
      module,
      recipients,
    )) as unknown[];
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

    if (isRuntimeValue(amounts) && /\[\d*\]$/.test(amounts.abiType.type)) {
      const length = smartArrayLength(module, amounts);
      await assertSmartComparison(
        module,
        length,
        ">=",
        BigInt(recipientList.length),
        "disperse amounts length does not match recipients",
      );
      await assertSmartComparison(
        module,
        length,
        "<=",
        BigInt(recipientList.length),
        "disperse amounts length does not match recipients",
      );
      const source = amounts;
      amounts = Array.from({ length: recipientList.length }, (_, i) =>
        smartValueElement(module, source, i),
      );
    }
    const amountList = (await snapshotSmartValue(
      module,
      Array.isArray(amounts) ? amounts : recipientList.map(() => amounts),
    )) as unknown[];
    if (amountList.length !== recipientList.length) {
      throw new ErrorException(
        `<amounts> length (${amountList.length}) does not match <recipients> length (${recipientList.length})`,
      );
    }

    return recipientList.map((to, i) =>
      encodeAction(token, "transfer(address,uint256)", [
        to as string,
        amountList[i] as Param,
      ]),
    );
  },
});
