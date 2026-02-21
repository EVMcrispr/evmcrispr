import { describe, it } from "bun:test";
import { commaListItems, listItems } from "@evmcrispr/sdk";
import { expect } from "chai";

describe("SDK > utils > formatters", () => {
  describe("commaListItems()", () => {
    it("should return the single item for a one-element list", () => {
      expect(commaListItems(["alpha"])).to.equal("alpha");
    });

    it("should join two items with 'and'", () => {
      expect(commaListItems(["alpha", "beta"])).to.equal("alpha and beta");
    });

    it("should join three items with commas and 'and'", () => {
      expect(commaListItems(["a", "b", "c"])).to.equal("a, b and c");
    });

    it("should join four items with commas and 'and'", () => {
      expect(commaListItems(["a", "b", "c", "d"])).to.equal("a, b, c and d");
    });
  });

  describe("listItems()", () => {
    it("should format a bulleted list with header", () => {
      const result = listItems("Errors found", ["error1", "error2"]);
      expect(result).to.include("Errors found:");
      expect(result).to.include("- error1");
      expect(result).to.include("- error2");
    });

    it("should format a single-item list", () => {
      const result = listItems("Items", ["only-one"]);
      expect(result).to.include("Items:");
      expect(result).to.include("- only-one");
    });
  });
});
