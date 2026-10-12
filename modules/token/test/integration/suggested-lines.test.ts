import "../setup";
import { expect, test } from "bun:test";
import { EXECUTOR, linesHold } from "@evmcrispr/test-utils/suggestions";
import { encodeAbiParameters, getAddress } from "viem";

const TOKEN = getAddress("0x00000000000000000000000000000000000700e1");
const BOB = getAddress("0x0000000000000000000000000000000000000b0b");
const word = (type: string, value: unknown) =>
  encodeAbiParameters([{ type }], [value as never]);
const views = {
  "balanceOf(address)": word("uint256", 900n),
  "allowance(address,address)": word("uint256", 900n),
  "balanceOf(address,uint256)": word("uint256", 900n),
  "ownerOf(uint256)": word("address", BOB),
  "getApproved(uint256)": word("address", BOB),
  "isApprovedForAll(address,address)": word("bool", true),
};

test("the lines token events suggest hold against the views they read", async () => {
  await linesHold(
    "token",
    [
      `assert @balance!(${TOKEN} ${EXECUTOR}) >= 899`,
      `assert @token:allowance!(${TOKEN} ${EXECUTOR} ${BOB}) == 900`,
      `assert ${TOKEN}::!{balanceOf(address,uint256)(uint256) ${EXECUTOR} 3} >= 89`,
      `assert ${TOKEN}::!{ownerOf(uint256)(address) 7} == ${BOB}`,
      `assert ${TOKEN}::!{getApproved(uint256)(address) 7} == ${BOB}`,
      `assert ${TOKEN}::!{isApprovedForAll(address,address)(bool) ${EXECUTOR} ${BOB}} == true`,
    ],
    { [TOKEN]: views },
  );
}, 180000);

test("a line that reads another view than the contract answers does not hold", async () => {
  await expect(
    linesHold("token", [`assert @balance!(${TOKEN} ${EXECUTOR}) >= 899`], {
      [TOKEN]: { "allowance(address,address)": word("uint256", 900n) },
    }),
  ).rejects.toThrow();
}, 180000);
