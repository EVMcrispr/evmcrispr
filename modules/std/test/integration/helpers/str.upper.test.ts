import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@str.upper", {
  cases: [
    {
      name: "should convert to uppercase",
      input: `@str.upper("hello")`,
      expected: "HELLO",
    },
    {
      name: "should handle already uppercase string",
      input: `@str.upper("ABC")`,
      expected: "ABC",
    },
    {
      name: "should handle mixed case",
      input: `@str.upper("Hello World")`,
      expected: "HELLO WORLD",
    },
  ],
}, helpers["str.upper"].argDefs);
