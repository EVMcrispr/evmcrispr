import { defineHelper, ErrorInvalid } from "@evmcrispr/sdk";
import type Std from "..";

const iso8601Regex =
  /^\d{4}(-\d\d(-\d\d(T\d\d:\d\d(:\d\d)?(\.\d+)?(([+-]\d\d:\d\d)|Z)?)?)?)?$/;
const offsetRegex =
  /^(?:([-+]\d+)y)?(?:([-+]\d+)mo)?(?:([-+]\d+)w)?(?:([-+]\d+)d)?(?:([-+]\d+)h)?(?:([-+]\d+)m)?(?:([-+]\d+)s?)?$/;

export default defineHelper<Std>({
  name: "date",
  description:
    "Parse a date string into a Unix timestamp, with an optional offset.",
  returnType: "number",
  args: [
    {
      name: "date",
      type: "string",
      description: "ISO 8601 date string or `now`",
    },
    {
      name: "offset",
      type: "string",
      description: "Time offset (e.g. `+1d`, `-2h`, `+3mo`)",
      optional: true,
    },
  ],
  async run(_, { date, offset }) {
    if (date !== "now" && !iso8601Regex.test(date)) {
      throw new ErrorInvalid("Invalid date provided.");
    }
    // Negative offsets like `-1y` parse as number literals and arrive
    // already evaluated into seconds (the interpreter applies the time
    // unit); `+1d` style offsets still arrive as strings.
    if (offset !== undefined && typeof offset !== "string") {
      const _date = date === "now" ? Date.now() : new Date(date.toString());
      return (Math.floor(_date.valueOf() / 1000) + Number(offset)).toString();
    }
    if (offset && !offsetRegex.test(offset)) {
      throw new ErrorInvalid("Invalid offset provided.");
    }
    const _date = date === "now" ? Date.now() : new Date(date.toString());
    const [
      ,
      years = 0,
      months = 0,
      weeks = 0,
      days = 0,
      hours = 0,
      minutes = 0,
      seconds = 0,
    ] = offset?.match(offsetRegex) || [];
    const offsetNum =
      Number(years) * 31_536_000 +
      Number(months) * 2_592_000 +
      Number(weeks) * 604_800 +
      Number(days) * 86_400 +
      Number(hours) * 3600 +
      Number(minutes) * 60 +
      Number(seconds);

    return (Math.floor(_date.valueOf() / 1000) + offsetNum).toString();
  },
});
