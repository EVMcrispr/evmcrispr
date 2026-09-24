import { describe, expect, it } from "bun:test";
import { compactAmount } from "../../src/utils/format";

describe("compactAmount", () => {
  it("keeps 4 significant digits below 1", () => {
    expect(compactAmount("0.000369077182443993")).toBe("0.0003691");
    expect(compactAmount("0.5")).toBe("0.5");
    expect(compactAmount("0.123456")).toBe("0.1235");
  });

  it("keeps at most 4 decimals from 1 up, with thousands separators", () => {
    expect(compactAmount("1")).toBe("1");
    expect(compactAmount("1.000001")).toBe("1");
    expect(compactAmount("1234.56789")).toBe("1,234.5679");
    expect(compactAmount("12")).toBe("12");
  });

  it("leaves what is not a number as it is", () => {
    expect(compactAmount("0")).toBe("0");
    expect(compactAmount("abc")).toBe("abc");
  });
});
