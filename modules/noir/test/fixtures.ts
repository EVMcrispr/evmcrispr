/**
 * The tiny fixture circuit shared by generate.ts and the tests: one
 * private input, one public input, trivially provable (x=3, y=5) and
 * trivially falsifiable (x=y).
 */
export const ASSERT_SOURCE = `fn main(x: Field, y: pub Field) {
    assert(x != y);
}
`;

export const BASE_URL = "https://noir.test/assert";
export const ARTIFACT_URL = `${BASE_URL}/artifact.json`;
export const SOURCE_URL = `${BASE_URL}/main.nr`;
