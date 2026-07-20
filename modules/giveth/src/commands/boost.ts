import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Giveth from "..";
import { givethLogin } from "../utils/auth";
import { fetchProject, setPowerBoostings } from "../utils/graphql";

/** impact-graph's MAX_PROJECT_BOOST_LIMIT. */
const MAX_BOOSTED_PROJECTS = 20;

function parseSlugs(value: unknown): string[] {
  const slugs = value as unknown[];
  if (!Array.isArray(slugs) || slugs.length === 0) {
    throw new ErrorException("<projects> must not be empty");
  }
  if (slugs.length > MAX_BOOSTED_PROJECTS) {
    throw new ErrorException(
      `Giveth allows boosting at most ${MAX_BOOSTED_PROJECTS} projects, got ${slugs.length}`,
    );
  }
  for (const slug of slugs) {
    if (typeof slug !== "string" || !slug) {
      throw new ErrorException(
        `<projects> must contain project slugs, got ${slug}`,
      );
    }
  }
  if (new Set(slugs).size !== slugs.length) {
    throw new ErrorException("<projects> contains duplicate slugs");
  }
  return slugs as string[];
}

function parsePercentages(value: unknown, count: number): number[] {
  if (!Array.isArray(value)) {
    throw new ErrorException("--with must be an array of percentages");
  }
  if (value.length !== count) {
    throw new ErrorException(
      `--with length (${value.length}) does not match <projects> length (${count})`,
    );
  }
  const percentages = value.map((v) => {
    const p = Number(v);
    if (!Number.isFinite(p) || p <= 0 || p > 100) {
      throw new ErrorException(
        `--with percentages must be numbers between 0 (exclusive) and 100, got ${v}`,
      );
    }
    return Math.round(p * 100) / 100;
  });
  const total = percentages.reduce((a, b) => a + b, 0);
  // Mirror impact-graph's tolerance: [100 - 0.01·n, 100.00001].
  if (total > 100.00001 || total < 100 - 0.01 * count) {
    throw new ErrorException(
      `--with percentages must sum to 100, got ${total}`,
    );
  }
  return percentages;
}

/** Split 100% evenly at 2-decimal precision, remainder on the first project. */
function equalSplit(count: number): number[] {
  const each = Math.floor(10000 / count) / 100;
  const first = Math.round((100 - each * (count - 1)) * 100) / 100;
  return [first, ...Array.from({ length: count - 1 }, () => each)];
}

export default defineCommand<Giveth>({
  name: "boost",
  description:
    "Allocate your GIVpower across Giveth projects by percentage. Off-chain: signs you in to Giveth with the connected wallet (SIWE) and replaces your entire existing boost allocation through the Giveth API; no transaction is sent, so it cannot be batched or simulated.",
  batchable: false,
  args: [
    {
      name: "projects",
      type: "array",
      description: "Giveth project URL slugs",
    },
  ],
  opts: [
    {
      name: "with",
      type: "array",
      description:
        "GIVpower percentage per project, matching <projects> and summing to 100; defaults to an equal split",
    },
  ],
  async run(module, { projects }, { opts, interpreters }) {
    const slugs = parseSlugs(projects);
    const percentages =
      opts.with === undefined
        ? equalSplit(slugs.length)
        : parsePercentages(opts.with, slugs.length);

    const { actionCallback } = interpreters;
    if (!actionCallback) {
      throw new ErrorException(
        "boost requires an execution context with wallet access",
      );
    }

    const boosted = await Promise.all(
      slugs.map((slug) => fetchProject(module, slug)),
    );
    const projectIds = boosted.map((p) => p.id);
    if (new Set(projectIds).size !== projectIds.length) {
      throw new ErrorException(
        "<projects> resolve to the same Giveth project more than once",
      );
    }

    const jwt = await givethLogin(module, actionCallback);
    await setPowerBoostings(module, jwt, projectIds, percentages);

    return [];
  },
});
