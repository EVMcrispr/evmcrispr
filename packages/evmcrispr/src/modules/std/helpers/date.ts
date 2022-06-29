const iso8601Regex =
  /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z)/;
const offsetRegex =
  /^(?:([-+]\d+)y)?(?:([-+]\d+)mo)?(?:([-+]\d+)w)?(?:([-+]\d+)d)?(?:([-+]\d+)h)?(?:([-+]\d+)m)?(?:([-+]\d+)s?)?$/;

async function date(
  _: unknown,
  date: string,
  offset?: string,
): Promise<string> {
  if (date != 'now' && !iso8601Regex.test(date)) {
    throw new Error('Invalid date provided.');
  }
  if (offset && !offsetRegex.test(offset)) {
    throw new Error('Invalid offset provided.');
  }
  const _date = date == 'now' ? Date.now() : new Date(date);
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
}

export default date;
