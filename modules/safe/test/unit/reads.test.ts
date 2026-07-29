import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { SENTINEL } from "../../src/addresses";
import { assertSafeVersion, findListPredecessor } from "../../src/utils/reads";

const A = "0x1111111111111111111111111111111111111111" as const;
const B = "0x2222222222222222222222222222222222222222" as const;
const C = "0x3333333333333333333333333333333333333333" as const;

describe("Safe > utils > findListPredecessor", () => {
  it("returns the sentinel for the first entry", () => {
    expect(findListPredecessor([A, B, C], A, "owner")).to.equal(SENTINEL);
  });

  it("returns the previous entry otherwise", () => {
    expect(findListPredecessor([A, B, C], C, "owner")).to.equal(B);
  });

  it("matches addresses case-insensitively", () => {
    expect(
      findListPredecessor(
        [A, B],
        B.toUpperCase().replace("0X", "0x") as any,
        "owner",
      ),
    ).to.equal(A);
  });

  it("throws when the entry is missing", () => {
    expect(() => findListPredecessor([A, B], C, "owner")).to.throw(
      "not found on the Safe",
    );
  });
});

describe("Safe > utils > assertSafeVersion", () => {
  const stub = (version: string | Error) =>
    ({
      readContract: async () => {
        if (version instanceof Error) throw version;
        return version;
      },
    }) as any;

  it("accepts 1.3.0 and newer", async () => {
    expect(await assertSafeVersion(stub("1.3.0"), A)).to.equal("1.3.0");
    expect(await assertSafeVersion(stub("1.4.1"), A)).to.equal("1.4.1");
  });

  it("rejects versions older than 1.3.0", async () => {
    for (const version of ["1.1.1", "1.2.0", "0.1.0"]) {
      let error: Error | undefined;
      await assertSafeVersion(stub(version), A).catch((e) => {
        error = e;
      });
      expect(error?.message).to.include("only Safe >=1.3.0 is supported");
    }
  });

  it("rejects contracts without VERSION()", async () => {
    let error: Error | undefined;
    await assertSafeVersion(stub(new Error("revert")), A).catch((e) => {
      error = e;
    });
    expect(error?.message).to.include("does not look like a Safe contract");
  });
});
