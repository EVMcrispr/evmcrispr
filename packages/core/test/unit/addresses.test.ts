import { describe, it } from "bun:test";
import { AddressMap, AddressSet } from "@evmcrispr/sdk";
import { expect } from "chai";

const ADDR_LOWER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ADDR_UPPER = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const ADDR_MIXED = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";

describe("SDK > utils > AddressSet", () => {
  it("should store addresses in lowercase", () => {
    const set = new AddressSet([ADDR_UPPER]);
    expect(set.has(ADDR_LOWER)).to.be.true;
    expect(set.has(ADDR_UPPER)).to.be.true;
    expect(set.has(ADDR_MIXED)).to.be.true;
  });

  it("should deduplicate case-insensitively", () => {
    const set = new AddressSet([ADDR_LOWER, ADDR_UPPER, ADDR_MIXED]);
    expect(set.size).to.equal(1);
  });

  it("should add addresses case-insensitively", () => {
    const set = new AddressSet();
    set.add(ADDR_UPPER);
    expect(set.has(ADDR_LOWER)).to.be.true;
    expect(set.size).to.equal(1);
  });

  it("should delete addresses case-insensitively", () => {
    const set = new AddressSet([ADDR_LOWER]);
    expect(set.delete(ADDR_UPPER)).to.be.true;
    expect(set.size).to.equal(0);
  });

  it("should support iteration", () => {
    const set = new AddressSet([
      ADDR_UPPER,
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ]);
    const items = [...set];
    expect(items).to.have.lengthOf(2);
    expect(items[0]).to.equal(ADDR_LOWER);
  });
});

describe("SDK > utils > AddressMap", () => {
  it("should get values case-insensitively", () => {
    const map = new AddressMap<number>();
    map.set(ADDR_UPPER, 42);
    expect(map.get(ADDR_LOWER)).to.equal(42);
    expect(map.get(ADDR_MIXED)).to.equal(42);
  });

  it("should check membership case-insensitively", () => {
    const map = new AddressMap<string>();
    map.set(ADDR_LOWER, "value");
    expect(map.has(ADDR_UPPER)).to.be.true;
  });

  it("should overwrite with case-insensitive keys", () => {
    const map = new AddressMap<string>();
    map.set(ADDR_UPPER, "first");
    map.set(ADDR_LOWER, "second");
    expect(map.size).to.equal(1);
    expect(map.get(ADDR_UPPER)).to.equal("second");
  });

  it("should support iteration", () => {
    const map = new AddressMap<number>();
    map.set(ADDR_UPPER, 1);
    map.set("0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", 2);
    expect(map.size).to.equal(2);
    const entries = [...map.entries()];
    expect(entries[0][0]).to.equal(ADDR_LOWER);
  });
});
