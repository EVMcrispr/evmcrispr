import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

const ts = (date?: string): string =>
  Math.floor((date ? new Date(date) : new Date()).valueOf() / 1000).toString();

describeHelper(
  "@date",
  {
    describeName: "Std > helpers > @date(date, offset?)",
    cases: [
      { name: "current date (now)", input: "@date(now)", expected: ts() },
      { name: "only year", input: "@date(2015)", expected: ts("2015") },
      {
        name: "year and month",
        input: "@date(2020-02)",
        expected: ts("2020-02"),
      },
      {
        name: "full date",
        input: "@date(2018-01-01)",
        expected: ts("2018-01-01"),
      },
      {
        name: "date and time without seconds",
        input: "@date(2010-05-11T18:30)",
        expected: ts("2010-05-11T18:30"),
      },
      {
        name: "full format",
        input: "@date(2010-05-11T18:30:05)",
        expected: ts("2010-05-11T18:30:05"),
      },
      {
        name: "UTC format",
        input: "@date(2009-05-11T09:24:16Z)",
        expected: ts("2009-05-11T09:24:16Z"),
      },
      {
        name: "negative UTC offset",
        input: "@date(2009-05-11T09:24:16-05:00)",
        expected: ts("2009-05-11T09:24:16-05:00"),
      },
      {
        name: "positive UTC offset",
        input: "@date(2009-05-11T09:24:16+10:20)",
        expected: ts("2009-05-11T09:24:16+10:20"),
      },
      {
        name: "negative yearly offset",
        input: "@date(2010-05-05, -2y)",
        expected: ts("2008-05-05"),
      },
      {
        name: "negative yearly and monthly offset",
        input: "@date(2010-05-05, -2y-1mo)",
        expected: ts("2008-04-05"),
      },
      {
        name: "negative yearly, monthly and weekly offset",
        input: "@date(2010-05-05, -2y-1mo-5w)",
        expected: ts("2008-03-01"),
      },
      {
        name: "negative yearly, monthly, weekly and hourly offset",
        input: "@date(2010-05-05, -2y-1mo-5w-1h)",
        expected: ts("2008-02-29T23:00Z"),
      },
      {
        name: "negative all units offset",
        input: "@date(2010-05-05, -2y-1mo-5w-1h-30m-15s)",
        expected: ts("2008-02-29T22:29:45Z"),
      },
      {
        name: "positive yearly offset",
        input: "@date(2010-05-05, +2y)",
        expected: ts("2012-05-04"),
      },
      {
        name: "positive yearly and monthly offset",
        input: "@date(2010-05-05, +2y+1mo)",
        expected: ts("2012-06-03"),
      },
      {
        name: "positive yearly, monthly and weekly offset",
        input: "@date(2010-05-05, +2y+1mo+5w)",
        expected: ts("2012-07-08"),
      },
      {
        name: "positive yearly, monthly, weekly and hourly offset",
        input: "@date(2010-05-05, +2y+1mo+5w+5h)",
        expected: ts("2012-07-08T05:00Z"),
      },
      {
        name: "positive yearly, monthly, weekly, hourly and minutely offset",
        input: "@date(2010-05-05, +2y+1mo+5w+5h+40m)",
        expected: ts("2012-07-08T05:40Z"),
      },
      {
        name: "positive all units offset",
        input: "@date(2010-05-05, +2y+1mo+5w+5h+40m+25s)",
        expected: ts("2012-07-08T05:40:25Z"),
      },
    ],
    sampleArgs: ["2010-05-05", "+2y"],
  },
  helpers.date.argDefs,
);
