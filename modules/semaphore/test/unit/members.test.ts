import { describe, it } from "bun:test";
import { leanRoot, loadPoseidon2 } from "@evmcrispr/module-zk";
import { expect } from "@evmcrispr/test-utils";
import { LeanIMT } from "@zk-kit/lean-imt";

// The replay logic is exercised through the exported surface in
// integration; here the removal/update semantics are pinned against
// zk-kit's reference tree: update/remove keep the size, remove = leaf 0.
describe("semaphore > member replay semantics", () => {
  it("reproduces roots through add/update/remove like the on-chain LeanIMT", async () => {
    const poseidon2 = await loadPoseidon2();
    const h = (a: bigint, b: bigint) => poseidon2(a, b);
    const reference = new LeanIMT(h, [1n, 2n, 3n]);
    const members = [1n, 2n, 3n];
    expect(leanRoot(members, h)).to.equal(reference.root);

    reference.update(1, 42n);
    members[1] = 42n;
    expect(leanRoot(members, h)).to.equal(reference.root);

    reference.update(2, 0n); // remove = update-to-zero, size kept
    members[2] = 0n;
    expect(leanRoot(members, h)).to.equal(reference.root);
    expect(members).to.have.length(3);
  });
});
