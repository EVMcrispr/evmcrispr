import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

const EOA = "0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6";

describeHelper(
  "@contracts:slot.erc7201",
  {
    module: "contracts",
    cases: [
      {
        // Reference value from the ERC-7201 specification.
        name: "should derive the spec example namespace",
        input: `@contracts:slot.erc7201("example.main")`,
        expected:
          "0x183a6125c38840424c4a85fa12bab2ab606c4b6d0e7cc73c0c06ba5300eab500",
      },
      {
        name: "should derive the OpenZeppelin Ownable namespace",
        input: `@contracts:slot.erc7201("openzeppelin.storage.Ownable")`,
        expected:
          "0x9016d09d72d40fdae2fd8ceac6b6234c7706214fd39c1cd1e609a0528c199300",
      },
    ],
    docCases: [
      {
        description: "Root slot of an ERC-7201 namespaced layout",
        code: `set $slot @contracts:slot.erc7201("openzeppelin.storage.Ownable")`,
      },
    ],
    sampleArgs: [`"example.main"`],
  },
  helpers["slot.erc7201"].argDefs,
);

describeHelper(
  "@contracts:slot.mapping",
  {
    module: "contracts",
    cases: [
      {
        name: "should derive the slot for an address key",
        input: `@contracts:slot.mapping(3 ${EOA})`,
        expected:
          "0xd518f8ff6eaa7abb14a6db0c1202556d423ef0cd690ffdfe4285020916d2e502",
      },
      {
        name: "should derive the slot for an integer key",
        input: "@contracts:slot.mapping(0 42)",
        expected:
          "0x64d962e4eec2a0d2e4053fc69d3b480f61c5923c09e4bad52cdeec343ff95073",
      },
      {
        name: "should derive the slot for a string key",
        input: `@contracts:slot.mapping(1 "hello")`,
        expected:
          "0x8404bb4d805e9ca2bd5dd5c43a107e935c8ec393caa7851b353b3192cd5379ae",
      },
      {
        name: "should accept a bytes32 base slot",
        input: `@contracts:slot.mapping(0x0000000000000000000000000000000000000000000000000000000000000000 42)`,
        expected:
          "0x64d962e4eec2a0d2e4053fc69d3b480f61c5923c09e4bad52cdeec343ff95073",
      },
    ],
    docCases: [
      {
        description: "Slot of balanceOf[account] for a mapping at slot 3",
        code: `set $slot @contracts:slot.mapping(3 0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6)`,
      },
    ],
    errorCases: [
      {
        name: "should reject a non-integer key",
        input: "@contracts:slot.mapping(0 1.5)",
        error: "key must be an integer",
      },
    ],
    sampleArgs: ["0", "42"],
  },
  helpers["slot.mapping"].argDefs,
);

describeHelper(
  "@contracts:slot.array",
  {
    module: "contracts",
    cases: [
      {
        name: "should derive the slot of the first element",
        input: "@contracts:slot.array(2 0)",
        expected:
          "0x405787fa12a823e0f2b7631cc41b3ba8828b3321ca811111fa75cd3aa3bb5ace",
      },
      {
        name: "should offset by the element index",
        input: "@contracts:slot.array(2 5)",
        expected:
          "0x405787fa12a823e0f2b7631cc41b3ba8828b3321ca811111fa75cd3aa3bb5ad3",
      },
    ],
    docCases: [
      {
        description: "Slot of the first element of a dynamic array at slot 2",
        code: `set $slot @contracts:slot.array(2 0)`,
      },
    ],
    errorCases: [
      {
        name: "should reject a negative index",
        input: "@contracts:slot.array(2 @num(0 - 5))",
        error: "non-negative integer",
      },
      {
        name: "should reject a fractional index",
        input: "@contracts:slot.array(2 1.5)",
        error: "non-negative integer",
      },
    ],
    sampleArgs: ["2", "0"],
  },
  helpers["slot.array"].argDefs,
);
