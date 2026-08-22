import Link from "next/link";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";
import { LiveAutoRefresh } from "../../components/live-auto-refresh";
import { AdSpaces } from "../../components/ad-spaces";
import { getLiveMatches } from "../../lib/live-football-server";

export const dynamic = "force-dynamic";
const visibleOffsets = Array.from({ length: 15 }, (_, index) => index - 7);
const weekdays = ["Կիր", "Երկ", "Երք", "Չրք", "Հնգ", "Ուրբ", "Շբթ"];
const months = ["հնվ", "փտր", "մրտ", "ապր", "մյս", "հնս", "հլս", "օգս", "սեպ", "հոկ", "նոյ", "դեկ"];

function dateAtOffset(dayOffset: number) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Yerevan", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + dayOffset)).toISOString().slice(0, 10);
}
function parseDate(date: string) { return new Date(`${date}T12:00:00Z`); }
function shortDate(date: string) { const parsed = parseDate(date); return `${parsed.getUTCDate()} ${months[parsed.getUTCMonth()]}`; }
function weekday(date: string) { return weekdays[parseDate(date).getUTCDay()]; }
function relativeLabel(offset: number) { if (offset === -1) return "Երեկ"; if (offset === 0) return "Այսօր"; if (offset === 1) return "Վաղը"; return weekday(dateAtOffset(offset)); }
function dateHref(offset: number, date: string) { return offset === 0 ? "/live" : `/live?date=${date}`; }

export default async function LivePage({ searchParams }: { searchParams: Promise<{ date?: string; day?: string }> }) {
  const { date: requestedDate, day: legacyDay } = await searchParams;
  const dates = visibleOffsets.map((offset) => ({ offset, date: dateAtOffset(offset) }));
  const legacyOffset = legacyDay === "yesterday" ? -1 : legacyDay === "tomorrow" ? 1 : 0;
  const selected = dates.find((item) => item.date === requestedDate) ?? dates.find((item) => item.offset === legacyOffset) ?? dates[7];
  const selectedIndex = dates.findIndex((item) => item.date === selected.date);
  const previous = dates[selectedIndex - 1];
  const next = dates[selectedIndex + 1];
  const live = await getLiveMatches(selected.offset);
  const competitions = Array.from(new Set(live.matches.map((match) => match.competition)));

  return <main><LiveAutoRefresh /><SiteHeader /><AdSpaces /><div className="site-shell inner-page">
    <span className="page-kicker">Խաղային կենտրոն</span><h1 className="page-title">Live արդյունքներ</h1><p className="page-intro">Հաշիվներ և խաղերի մանրամասն կենտրոն՝ գոլեր, ասիստներ, քարտեր, պենալտիներ, փոխարինումներ, կազմեր և վիճակագրություն։</p>
    <div className="live-date-picker">
      {previous ? <Link prefetch={false} className="date-arrow" href={dateHref(previous.offset, previous.date)} aria-label="Նախորդ օրը">‹</Link> : <span className="date-arrow disabled">‹</span>}
      <details className="live-calendar"><summary><span className="calendar-icon">▦</span><strong>{relativeLabel(selected.offset)} · {shortDate(selected.date)}</strong><small>{weekday(selected.date)}</small></summary><div className="live-calendar-panel">{dates.map((item) => <Link prefetch={false} className={item.date === selected.date ? "active" : ""} href={dateHref(item.offset, item.date)} key={item.date}><span>{relativeLabel(item.offset)}</span><strong>{shortDate(item.date)}</strong><small>{weekday(item.date)}</small></Link>)}</div></details>
      {next ? <Link prefetch={false} className="date-arrow" href={dateHref(next.offset, next.date)} aria-label="Հաջորդ օրը">›</Link> : <span className="date-arrow disabled">›</span>}
    </div>
    <div className="live-page-grid"><section className="matchday-card"><div className="matchday-head"><span>{relativeLabel(selected.offset)} · {shortDate(selected.date)} · ընտրված մրցաշարերը</span><small className={live.unavailable || live.limited ? "data-source demo" : "data-source real"}>{live.unavailable ? "Տվյալները ժամանակավորապես անհասանելի են" : live.limited ? "Սահմանափակ API ծածկույթ" : "Իրական տվյալներ"}</small></div>
      {live.matches.length ? competitions.map((competition) => <section className="match-competition-group" key={competition}><h2>{competition}</h2>{live.matches.filter((match) => match.competition === competition).map((match) => <details className="match-expand" key={match.id}><summary className="match-row"><span className={match.isLive ? "match-live-status live-beacon-status" : ""}>{match.status}</span><strong>{match.home}</strong><b className="score-big">{match.homeScore ?? "–"} : {match.awayScore ?? "–"}</b><strong>{match.away}</strong></summary><div className="match-expand-body"><span>{match.isLive ? "🔴 Խաղը ընթացքի մեջ է · տվյալները թարմացվում են ինքնաշխատ" : "Խաղի մանրամասները"}</span>{match.id.startsWith("tsdb-") ? <><small>⚽ Գոլեր · 🎯 ասիստներ · 🟨🟥 քարտեր · 🔄 փոխարինումներ · պենալտիներ · կազմեր · xG · վիճակագրություն</small><Link href={`/live/match/${match.id}`}>Բացել Match Center →</Link></> : <small>Այս խաղի մանրամասն տվյալները տվյալ աղբյուրից դեռ հասանելի չեն</small>}</div></details>)}</section>) : <div className="no-matches">{live.unavailable ? "Տվյալները ժամանակավորապես չեն թարմացվում։ Փորձեք մի փոքր ուշ։" : `${shortDate(selected.date)}-ին ընտրված մրցաշարերում հանդիպումներ չկան կամ API-ի ծածկույթից դուրս են։`}</div>}
    </section><aside className="live-note"><h3>Match Center</h3><p>Խաղը բացելիս կտեսնեք API-ից հասանելի գոլերը և րոպեները, ասիստները, քարտերը, պենալտիները, փոխարինումները, կազմերը, մրցավարին, մարզադաշտը, xG-ն և հիմնական վիճակագրությունը։</p></aside></div>
  </div><AdSpaces bottom /><SiteFooter /></main>;
}
