import "../../setup";
import {
  describeParity,
  installConstantMock,
} from "@evmcrispr/test-utils/onchain";
import { encodeAbiParameters } from "viem";
import { helpers } from "../../../src/_generated";

const TEXT = "0x0000000000000000000000000000000000007d01";
const INTEGER = "0x0000000000000000000000000000000000007d02";
const S = `${TEXT}::{value()(string)}`;
const I = `${INTEGER}::{value()(int256)}`;
describeParity("decimal conversion", {
  module: "lang [@num.parse @num.format]",
  helpers,
  setup: async (client) => {
    await installConstantMock(
      client,
      TEXT,
      encodeAbiParameters([{ type: "string" }], ["-1.239"]),
    );
    await installConstantMock(
      client,
      INTEGER,
      encodeAbiParameters([{ type: "int256" }], [-1239n]),
    );
  },
  cases: [
    {
      name: "parse truncates negative excess digits",
      run: `@num.parse(${S} 2)`,
      compile: `@num.parse!(${S} 2)`,
    },
    {
      name: "parse floors negative excess digits",
      run: `@num.parse(${S} 2 floor)`,
      compile: `@num.parse!(${S} 2 floor)`,
    },
    {
      name: "parse ceils negative excess digits",
      run: `@num.parse(${S} 2 ceil)`,
      compile: `@num.parse!(${S} 2 ceil)`,
    },
    {
      name: "format signed integer",
      run: `@num.format(${I} 3)`,
      compile: `@num.format!(${I} 3)`,
    },
  ],
});
