import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "balance!",
  description:
    "Read a balance on-chain at assertion time: the native balance for ETH, or an ERC-20 balanceOf for any token symbol or address.",
  returnType: "number",
  args: [
    {
      name: "token",
      type: "any",
      description:
        "ETH (native) or a token symbol/address resolved like @token",
    },
    {
      name: "account",
      type: "any",
      description:
        "Account address, or (native only) a `::` call resolving to one",
    },
  ],
});
