// Dates in Armenian, computed from the date parts rather than from a locale.
//
// The site was asking Intl for "hy-AM", but the Workers runtime does not
// carry the Armenian locale data, so every one of those calls silently fell
// back to US formatting - which is why a birthday showed as 04/21/1997 and
// the header printed "Wednesday, September 3" on an otherwise Armenian
// page. Reading the parts through the "en-US" locale (which the runtime
// does have) and assembling the string ourselves gives the same output
// everywhere, on the runtime and in local development alike.

const MONTH_HY = [
  "հունվարի", "փետրվարի", "մարտի", "ապրիլի", "մայիսի", "հունիսի",
  "հուլիսի", "օգոստոսի", "սեպտեմբերի", "հոկտեմբերի", "նոյեմբերի", "դեկտեմբերի",
];
const WEEKDAY_HY = ["կիրակի", "երկուշաբթի", "երեքշաբթի", "չորեքշաբթի", "հինգշաբթի", "ուրբաթ", "շաբաթ"];

const YEREVAN = "Asia/Yerevan";

function parts(date: Date, timeZone?: string) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    ...(timeZone ? { timeZone } : { timeZone: "UTC" }),
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  }).formatToParts(date);
  const value = Object.fromEntries(formatted.map((part) => [part.type, part.value]));
  return {
    year: value.year, month: value.month, day: value.day,
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value.weekday ?? ""),
  };
}

// A calendar date with no time of day (a birthday, a transfer). Read in UTC:
// "1997-04-21" is midnight UTC, and shifting it into another zone can move
// it to the previous day.
export function formatDateHy(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const p = parts(date);
  return `${p.day}.${p.month}.${p.year}`;
}

// A moment in time (a kickoff, a past fixture), shown in Yerevan time.
export function formatDateYerevan(value: string | number | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const p = parts(date, YEREVAN);
  return `${p.day}.${p.month}.${p.year}`;
}

export function formatLongDateHy(value: string | number | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const p = parts(date, YEREVAN);
  const weekday = p.weekday >= 0 ? `${WEEKDAY_HY[p.weekday]}, ` : "";
  return `${weekday}${Number(p.day)} ${MONTH_HY[Number(p.month) - 1]}`;
}

export function formatTimeYerevan(value: string | number | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: YEREVAN, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}
