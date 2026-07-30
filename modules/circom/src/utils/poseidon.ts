/**
 * Lazy loaders for the circomlib Poseidon permutation (poseidon-lite).
 *
 * poseidon-lite ships one entry point per arity so the (large) round
 * constants are only pulled in for arities a script actually uses; the
 * Merkle-tree helpers only ever load the 2-arity variant.
 */

type PoseidonFn = (inputs: bigint[]) => bigint;

export const MAX_POSEIDON_ARITY = 16;

const loaders: (() => Promise<Record<string, unknown>>)[] = [
  () => import("poseidon-lite/poseidon1"),
  () => import("poseidon-lite/poseidon2"),
  () => import("poseidon-lite/poseidon3"),
  () => import("poseidon-lite/poseidon4"),
  () => import("poseidon-lite/poseidon5"),
  () => import("poseidon-lite/poseidon6"),
  () => import("poseidon-lite/poseidon7"),
  () => import("poseidon-lite/poseidon8"),
  () => import("poseidon-lite/poseidon9"),
  () => import("poseidon-lite/poseidon10"),
  () => import("poseidon-lite/poseidon11"),
  () => import("poseidon-lite/poseidon12"),
  () => import("poseidon-lite/poseidon13"),
  () => import("poseidon-lite/poseidon14"),
  () => import("poseidon-lite/poseidon15"),
  () => import("poseidon-lite/poseidon16"),
];

const cache = new Map<number, Promise<PoseidonFn>>();

/** Load the Poseidon hash for the given arity (1..16), memoized per arity. */
export function loadPoseidon(arity: number): Promise<PoseidonFn> {
  let loaded = cache.get(arity);
  if (!loaded) {
    loaded = loaders[arity - 1]().then(
      (mod) => mod[`poseidon${arity}`] as PoseidonFn,
    );
    cache.set(arity, loaded);
    loaded.catch(() => cache.delete(arity));
  }
  return loaded;
}

/** Convenience 2-arity loader for the Merkle-tree helpers. */
export async function loadPoseidon2(): Promise<
  (a: bigint, b: bigint) => bigint
> {
  const poseidon2 = await loadPoseidon(2);
  return (a, b) => poseidon2([a, b]);
}
