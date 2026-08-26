import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Giveth from "..";
import { givethLogin } from "../utils/auth";
import {
  boostingsOverlayKey,
  fetchPowerBoostings,
  fetchProject,
  fetchUserId,
  type PowerBoosting,
  setPowerBoostings,
  userOverlayKey,
} from "../utils/graphql";

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

function parseDeltas(value: unknown, count: number): number[] {
  if (!Array.isArray(value)) {
    throw new ErrorException("--by must be an array of percentage changes");
  }
  if (value.length !== count) {
    throw new ErrorException(
      `--by length (${value.length}) does not match <projects> length (${count})`,
    );
  }
  return value.map((v) => {
    const d = Number(v);
    if (!Number.isFinite(d) || d === 0 || d < -100 || d > 100) {
      throw new ErrorException(
        `--by changes must be non-zero numbers between -100 and 100, got ${v}`,
      );
    }
    return Math.round(d * 100) / 100;
  });
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
    "Allocate your GIVpower across Giveth projects by percentage. With --with (or no option) it replaces your entire existing allocation; with --by it changes the listed projects by percentage points and the rest of your allocation absorbs the difference proportionally. Off-chain: signs you in to Giveth with the connected wallet (SIWE) and updates the allocation through the Giveth API; no transaction is sent, so it cannot be batched; inside sim:fork the allocation is applied to the simulation only (later reads in the same sim:fork see it) and never sent to Giveth.",
  batchable: false,
  args: [
    {
      name: "projects",
      type: ["array", "giveth-project"],
      description: "Giveth project URL slugs",
    },
  ],
  opts: [
    {
      name: "with",
      type: "array",
      description:
        "GIVpower percentage per project, matching <projects> and summing to 100; replaces your entire allocation. Defaults to an equal split",
    },
    {
      name: "by",
      type: "array",
      description:
        "Percentage-point change per project (e.g. [20 -20]), matching <projects>; the net change is absorbed proportionally by your other boosted projects",
    },
  ],
  async run(module, { projects }, { opts, interpreters }) {
    const slugs = parseSlugs(projects);
    if (opts.with !== undefined && opts.by !== undefined) {
      throw new ErrorException("--with and --by cannot be combined");
    }
    const deltas =
      opts.by === undefined ? undefined : parseDeltas(opts.by, slugs.length);
    const percentages =
      deltas !== undefined
        ? undefined
        : opts.with === undefined
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
    // Slugs of every project the final allocation may name, for the
    // simulated allocation recorded below.
    const slugById = new Map(boosted.map((p) => [p.id, p.slug]));

    let finalIds: number[];
    let finalPercentages: number[];
    if (deltas !== undefined) {
      const account = await module.getConnectedAccount(true);
      const userId = await fetchUserId(module, account);
      const current =
        userId === undefined
          ? []
          : (await fetchPowerBoostings(module, userId)).filter(
              (b) => b.percentage > 0,
            );
      for (const b of current) slugById.set(b.project.id, b.project.slug);
      // Start from the existing allocation and shift the given projects;
      // the untouched rest absorbs the net change proportionally. All
      // arithmetic in hundredths of a percent so it stays exact.
      const toCents = (p: number) => Math.round(p * 100);
      const allocation = new Map<number, number>(
        current.map((b) => [Number(b.project.id), toCents(b.percentage)]),
      );
      slugs.forEach((slug, i) => {
        const before = allocation.get(projectIds[i]) ?? 0;
        const next = before + toCents(deltas[i]);
        if (next < 0) {
          throw new ErrorException(
            `cannot decrease ${slug} by ${-deltas[i]}: it only has ${before / 100}% boosted`,
          );
        }
        allocation.set(projectIds[i], next);
      });
      const listed = new Set(projectIds);
      const net = deltas.reduce((a, d) => a + toCents(d), 0);
      const rest = [...allocation].filter(
        ([id, c]) => !listed.has(id) && c > 0,
      );
      const restTotal = rest.reduce((a, [, c]) => a + c, 0);
      if (net !== 0 && restTotal > 0) {
        if (net > restTotal) {
          throw new ErrorException(
            `the changes take ${net / 100}% from the other boosted projects, which only have ${restTotal / 100}% boosted`,
          );
        }
        // Scale the rest to absorb the net change, sticking any rounding
        // remainder on its largest project.
        const target = restTotal - net;
        const scaled = rest.map(
          ([id, c]) =>
            [id, Math.round((c * target) / restTotal)] as [number, number],
        );
        const diff = target - scaled.reduce((a, [, c]) => a + c, 0);
        if (diff !== 0) {
          scaled.reduce((m, e) => (e[1] > m[1] ? e : m))[1] += diff;
        }
        for (const [id, c] of scaled) allocation.set(id, c);
      } else if (net !== 0) {
        const total = [...allocation.values()].reduce((a, b) => a + b, 0);
        if (total !== 10000) {
          throw new ErrorException(
            `the changes leave the allocation at ${total / 100}%, not 100 — there are no other boosted projects to absorb the difference`,
          );
        }
      }
      const entries = [...allocation].filter(([, c]) => c > 0);
      if (entries.length > MAX_BOOSTED_PROJECTS) {
        throw new ErrorException(
          `the resulting allocation has ${entries.length} projects, Giveth allows at most ${MAX_BOOSTED_PROJECTS}`,
        );
      }
      finalIds = entries.map(([id]) => id);
      finalPercentages = entries.map(([, c]) => c / 100);
      const total = entries.reduce((a, [, c]) => a + c, 0);
      // Mirror impact-graph's tolerance: [100 - 0.01·n, 100.00001].
      if (total > 10000 || total < 10000 - entries.length) {
        throw new ErrorException(
          `the resulting allocation sums to ${total / 100}, not 100 — use --with to set a full allocation`,
        );
      }
    } else {
      finalIds = projectIds;
      finalPercentages = percentages!;
    }

    if (interpreters.simulation) {
      // Not sent to Giveth: record the allocation in the simulation overlay
      // so @giveth:boostedBy and later boosts in this sim:fork observe it.
      const account = await module.getConnectedAccount(true);
      let userId = await fetchUserId(module, account);
      if (userId === undefined) {
        // Giveth creates the user on first sign-in; stand in for that with
        // an id no real user has.
        userId = -1;
        module.offchain.set(userOverlayKey(account), userId);
      }
      const allocation: PowerBoosting[] = finalIds.map((id, i) => ({
        percentage: finalPercentages[i],
        project: { id, slug: slugById.get(id) ?? String(id) },
      }));
      module.offchain.set(boostingsOverlayKey(userId), allocation);
      module.context.log(
        `simulation: boosted [${allocation
          .map((b) => `${b.project.slug}: ${b.percentage}%`)
          .join(", ")}] — applied to the simulation only, not sent to Giveth`,
      );
      return [];
    }

    const jwt = await givethLogin(module, actionCallback);
    await setPowerBoostings(module, jwt, finalIds, finalPercentages);

    return [];
  },
});
