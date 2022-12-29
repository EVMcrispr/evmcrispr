import { ErrorInvalid } from '../../errors';
import type { HelperFunction } from '../../types';
import { ComparisonType, checkArgsLength } from '../../utils';
import type { Std } from '../Std';

const iso8601Regex =
  /^\d{4}(-\d\d(-\d\d(T\d\d:\d\d(:\d\d)?(\.\d+)?(([+-]\d\d:\d\d)|Z)?)?)?)?$/;
const offsetRegex =
  /^(?:([-+]\d+)y)?(?:([-+]\d+)mo)?(?:([-+]\d+)w)?(?:([-+]\d+)d)?(?:([-+]\d+)h)?(?:([-+]\d+)m)?(?:([-+]\d+)s?)?$/;

export const date: HelperFunction<Std> = async (_, h, { interpretNodes }) => {
  checkArgsLength(h, {
    type: ComparisonType.Between,
    minValue: 1,
    maxValue: 2,
  });

  const [date, offset] = await interpretNodes(h.args);
  if (date != 'now' && !iso8601Regex.test(date)) {
    throw new ErrorInvalid('Invalid date provided.');
  }
  if (offset && !offsetRegex.test(offset)) {
    throw new ErrorInvalid('Invalid offset provided.');
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
};
