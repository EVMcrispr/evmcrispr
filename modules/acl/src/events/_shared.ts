import {
  type Candidate,
  type CompanionView,
  type LineTemplate,
  type SentencePart,
  type SuggestEnv,
  sameValue,
} from "@evmcrispr/sdk";

/** Like `stateCandidate`, for a view that returns several values: the
 *  first one is compared. */
export async function firstWordCandidate(
  env: SuggestEnv,
  view: CompanionView,
  line: LineTemplate,
  sentence: SentencePart[],
): Promise<Candidate[]> {
  const got = await env.read(view.address, view.signature, view.args);
  const first = Array.isArray(got) ? got[0] : got;
  if (first === undefined || !sameValue(first, view.expect)) return [];
  return [{ line, sentence, kind: "state" }];
}

/** The last log per key: a run's final word on each subject. */
export function lastBy<T>(logs: T[], key: (log: T) => string): T[] {
  return [...new Map(logs.map((l) => [key(l), l])).values()];
}
