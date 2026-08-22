import { armenianTeamName } from "./team-names-hy";
import type { LiveMatch, LiveMatchDetail } from "./live-football-server";

type FootballDataMatch = {
  id: number;
  utcDate: string;
  status: string;
  minute?: number | null;
  competition: { code: string; name: string };
  homeTeam: { name: string; shortName?: string };
  awayTeam: { name: string; shortName?: string };
  score: {
    fullTime?: { home: number | null; away: number | null };
    regularTime?: { home: number | null; away: number | null };
  };
};

type SportsDbEvent = {
  idEvent: string;
  strEvent?: string | null;
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
  strTimestamp?: string | null;
  dateEvent?: string | null;
  strTime?: string | null;
  strVenue?: string | null;
  strReferee?: string | null;
};

type SportsDbTimeline = {
  intTime?: string | number | null;
  strTimeline?: string | null;
  strEvent?: string | null;
  strTeam?: string | null;
  strPlayer?: string | null;
  strAssist?: string | null;
  strDetail?: string | null;
};

type SportsDbLineup = {
  strTeam?: string | null;
  strPlayer?: string | null;
  strSubstitute?: string | null;
  strFormation?: string | null;
};

type SportsDbStatistic = {
  strTeam?: string | null;
  strStat?: string | null;
  intStat?: string | number | null;
};

const FREE_KEY = "123";
const competitionNames: Record<string, string> = {
  CL: "Չեմպիոնների լիգա",
  PL: "Անգլիայի Պրեմիեր լիգա",
  PD: "Իսպանիայի Լա Լիգա",
  SA: "Իտալիայի Սերիա Ա",
  BL1: "Գերմանիայի Բունդեսլիգա",
  FL1: "Ֆրանսիայի Լիգա 1",
};

function cleanWords(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(football club|club de futbol|club de fútbol|futbol club|fc|cf|afc|ac|ssc|calcio|vfl|sv|sc|rcd|rc|ud|cd)\b/g, " ")
    .replace(/\b(18|19|20)\d{2}\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function canonicalTeam(value: string) {
  const cleaned = cleanWords(value);
  const joined = cleaned.replace(/\s+/g, "");
  const aliases: [RegExp, string][] = [
    [/internazionale|intermilan|internazionalemilano/, "inter"],
    [/parissaintgermain|parissg|psg/, "psg"],
    [/olympiquelyonnais|olympiquelyon|lyonnais/, "lyon"],
    [/olympiquedemarseille|olympiquemarseille/, "marseille"],
    [/espanyoldebarcelona|rcdespanyol|reialclubdeportiuespanyol/, "espanyol"],
    [/realmadrid/, "realmadrid"],
    [/atleticodemadrid|clubatleticodemadrid/, "atleticomadrid"],
    [/athleticclubdebilbao|athleticbilbao|athleticclub/, "athleticbilbao"],
    [/realbetisbalompie|realbetis/, "realbetis"],
    [/bayernmunchen|bayernmunich/, "bayernmunich"],
    [/borussiamonchengladbach|borussiamgladbach|monchengladbach/, "monchengladbach"],
    [/koln|cologne/, "cologne"],
    [/sportingclubedeportugal|sportinglisbon|sportingcp/, "sporting"],
    [/redbullsalzburg|rbsalzburg/, "salzburg"],
    [/redbullleipzig|rbleipzig/, "leipzig"],
  ];
  for (const [pattern, replacement] of aliases) if (pattern.test(joined)) return replacement;
  return joined;
}

function teamSimilarity(a: string, b: string) {
  const ca = canonicalTeam(a);
  const cb = canonicalTeam(b);
  if (!ca || !cb) return 0;
  if (ca === cb) return 1;
  if (ca.includes(cb) || cb.includes(ca)) return Math.min(ca.length, cb.length) / Math.max(ca.length, cb.length) + 0.2;
  const aw = new Set(cleanWords(a).split(/\s+/).filter(Boolean));
  const bw = new Set(cleanWords(b).split(/\s+/).filter(Boolean));
  const intersection = [...aw].filter((word) => bw.has(word)).length;
  const union = new Set([...aw, ...bw]).size || 1;
  return intersection / union;
}

function sameTeam(a: string, b: string) {
  return teamSimilarity(a, b) >= 0.55;
}

function teamVariants(name: string, shortName?: string) {
  const values = [name, shortName || "", cleanWords(name), cleanWords(shortName || "")]
    .map((value) => value.trim())
    .filter(Boolean);
  const compact = canonicalTeam(name);
  const readableAlias: Record<string, string> = {
    inter: "Inter Milan",
    psg: "Paris Saint-Germain",
    lyon: "Lyon",
    marseille: "Marseille",
    espanyol: "Espanyol",
    realmadrid: "Real Madrid",
    atleticomadrid: "Atletico Madrid",
    athleticbilbao: "Athletic Bilbao",
    realbetis: "Real Betis",
    bayernmunich: "Bayern Munich",
    monchengladbach: "Borussia Monchengladbach",
    cologne: "FC Koln",
    sporting: "Sporting CP",
    salzburg: "Red Bull Salzburg",
    leipzig: "RB Leipzig",
  };
  if (readableAlias[compact]) values.push(readableAlias[compact]);
  return [...new Set(values)].slice(0, 4);
}

function eventTimestamp(event: SportsDbEvent) {
  const value = event.strTimestamp || `${event.dateEvent || ""}T${event.strTime || "00:00:00"}Z`;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function eventScore(event: SportsDbEvent, match: FootballDataMatch) {
  const home = teamSimilarity(event.strHomeTeam || "", match.homeTeam.name || match.homeTeam.shortName || "");
  const away = teamSimilarity(event.strAwayTeam || "", match.awayTeam.name || match.awayTeam.shortName || "");
  const diff = Math.abs(eventTimestamp(event) - new Date(match.utcDate).getTime());
  const timeBonus = eventTimestamp(event) && diff <= 4 * 60 * 60 * 1000 ? 0.25 : 0;
  return home + away + timeBonus;
}

async function json<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function findSportsDbEvent(base: string, match: FootballDataMatch) {
  const date = match.utcDate.slice(0, 10);
  const homes = teamVariants(match.homeTeam.name, match.homeTeam.shortName);
  const aways = teamVariants(match.awayTeam.name, match.awayTeam.shortName);
  const pairs: [string, string][] = [];
  for (let i = 0; i < Math.min(homes.length, aways.length); i++) pairs.push([homes[i], aways[i]]);
  pairs.push([homes[0], aways[0]], [homes.at(-1) || homes[0], aways.at(-1) || aways[0]]);

  let best: SportsDbEvent | null = null;
  let bestScore = 0;
  for (const [home, away] of [...new Map(pairs.map((pair) => [pair.join("|"), pair])).values()].slice(0, 5)) {
    const title = `${home}_vs_${away}`.replace(/\s+/g, "_");
    const data = await json<{ event?: SportsDbEvent[] | null; events?: SportsDbEvent[] | null }>(`${base}/searchevents.php?e=${encodeURIComponent(title)}&d=${date}`);
    const events = data?.event ?? data?.events ?? [];
    for (const event of events) {
      const score = eventScore(event, match);
      if (score > bestScore) {
        best = event;
        bestScore = score;
      }
    }
    if (bestScore >= 1.8) return best;
  }

  const day = await json<{ events?: SportsDbEvent[] | null }>(`${base}/eventsday.php?d=${date}&s=Soccer`);
  for (const event of day?.events ?? []) {
    const score = eventScore(event, match);
    if (score > bestScore) {
      best = event;
      bestScore = score;
    }
  }
  return bestScore >= 1.15 ? best : null;
}

function footballDataStatus(match: FootballDataMatch) {
  if (match.status === "PAUSED") return "Ընդմիջում";
  if (match.status === "IN_PLAY") return match.minute ? `${match.minute}′` : "LIVE";
  if (match.status === "FINISHED" || match.status === "AWARDED") return "Ավարտված";
  if (match.status === "POSTPONED") return "Հետաձգված";
  if (match.status === "CANCELLED") return "Չեղարկված";
  if (match.status === "SUSPENDED") return "Կասեցված";
  return new Intl.DateTimeFormat("hy-AM", { timeZone: "Asia/Yerevan", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(match.utcDate));
}

function timelineLabel(item: SportsDbTimeline) {
  const value = `${item.strTimeline || ""} ${item.strEvent || ""} ${item.strDetail || ""}`.toLowerCase();
  if (value.includes("own goal")) return "Ինքնագոլ";
  if (value.includes("missed penalty")) return "Չիրացված 11 մետրանոց";
  if (value.includes("penalty") && value.includes("goal")) return "Գոլ՝ 11 մետրանոցից";
  if (value.includes("penalty")) return "11 մետրանոց";
  if (value.includes("goal")) return "Գոլ";
  if (value.includes("red")) return "Կարմիր քարտ";
  if (value.includes("yellow")) return "Դեղին քարտ";
  if (value.includes("substitution") || value.includes("subst")) return "Փոխարինում";
  if (value.includes("var")) return "VAR";
  return item.strTimeline || item.strEvent || item.strDetail || "Իրադարձություն";
}

function statValue(rows: SportsDbStatistic[], team: string, names: string[]) {
  const row = rows.find((item) => sameTeam(item.strTeam || "", team) && names.some((name) => (item.strStat || "").toLowerCase().includes(name)));
  return row?.intStat === null || row?.intStat === undefined || row.intStat === "" ? "—" : String(row.intStat);
}

export async function getEnrichedLiveMatchDetails(id: string): Promise<LiveMatchDetail | null> {
  const footballDataId = id.replace(/^fd-/, "");
  if (!/^\d+$/.test(footballDataId)) return null;

  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  if (!runtime.FOOTBALL_DATA_TOKEN) return null;

  const footballResponse = await fetch(`https://api.football-data.org/v4/matches/${footballDataId}`, {
    headers: { "X-Auth-Token": runtime.FOOTBALL_DATA_TOKEN, Accept: "application/json" },
  });
  if (!footballResponse.ok) return null;
  const fd = (await footballResponse.json()) as FootballDataMatch;
  const competition = competitionNames[fd.competition.code];
  if (!competition) return null;

  const score = fd.score.fullTime ?? fd.score.regularTime;
  const match: LiveMatch = {
    id: `fd-${fd.id}`,
    status: footballDataStatus(fd),
    competition,
    home: armenianTeamName(fd.homeTeam.name || fd.homeTeam.shortName || ""),
    away: armenianTeamName(fd.awayTeam.name || fd.awayTeam.shortName || ""),
    homeScore: score?.home ?? null,
    awayScore: score?.away ?? null,
    isLive: fd.status === "IN_PLAY" || fd.status === "PAUSED",
  };

  const key = runtime.THESPORTSDB_API_KEY || FREE_KEY;
  const base = `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(key)}`;
  const event = await findSportsDbEvent(base, fd);
  if (!event) return { match, venue: "Տվյալ չկա", referee: "Տվյալ չկա", events: [], lineups: [], statistics: [] };

  const eventId = event.idEvent;
  const [timelineData, lineupData, statsData] = await Promise.all([
    json<{ timeline?: SportsDbTimeline[] | null }>(`${base}/lookuptimeline.php?id=${eventId}`),
    json<{ lineup?: SportsDbLineup[] | null }>(`${base}/lookuplineup.php?id=${eventId}`),
    json<{ eventstats?: SportsDbStatistic[] | null }>(`${base}/lookupeventstats.php?id=${eventId}`),
  ]);

  const grouped = new Map<string, SportsDbLineup[]>();
  for (const row of lineupData?.lineup ?? []) {
    const team = row.strTeam || "Թիմ";
    grouped.set(team, [...(grouped.get(team) ?? []), row]);
  }

  const stats = statsData?.eventstats ?? [];
  const teams = [event.strHomeTeam || fd.homeTeam.name, event.strAwayTeam || fd.awayTeam.name];

  return {
    match,
    venue: event.strVenue || "Տվյալ չկա",
    referee: event.strReferee || "Տվյալ չկա",
    events: (timelineData?.timeline ?? []).map((item) => ({
      minute: item.intTime === null || item.intTime === undefined ? "—" : `${item.intTime}′`,
      team: armenianTeamName(item.strTeam || "—"),
      player: item.strPlayer || "—",
      assist: item.strAssist || "—",
      label: timelineLabel(item),
    })),
    lineups: Array.from(grouped.entries()).map(([team, rows]) => ({
      team: armenianTeamName(team),
      formation: rows.find((row) => row.strFormation)?.strFormation || "—",
      starters: rows.filter((row) => !/yes|true|1/i.test(row.strSubstitute || "")).map((row) => row.strPlayer || "—"),
      substitutes: rows.filter((row) => /yes|true|1/i.test(row.strSubstitute || "")).map((row) => row.strPlayer || "—"),
    })),
    statistics: teams.map((team) => ({
      team: armenianTeamName(team),
      possession: statValue(stats, team, ["possession"]),
      shotsOnGoal: statValue(stats, team, ["shots on goal", "shots on target"]),
      totalShots: statValue(stats, team, ["total shots", "shots"]),
      xg: statValue(stats, team, ["expected goals", "xg"]),
    })),
  };
}
