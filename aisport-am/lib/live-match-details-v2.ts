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
  strOfficial?: string | null;
};

type SportsDbTimeline = {
  intTime?: string | number | null;
  strTimeline?: string | null;
  strTimelineDetail?: string | null;
  strEvent?: string | null;
  strTeam?: string | null;
  strPlayer?: string | null;
  strAssist?: string | null;
  strComment?: string | null;
};

type SportsDbLineup = {
  strTeam?: string | null;
  strPlayer?: string | null;
  strSubstitute?: string | null;
  strPosition?: string | null;
};

type SportsDbStatistic = {
  strStat?: string | null;
  intHome?: string | number | null;
  intAway?: string | number | null;
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

const sportsDbLeagueIds: Record<string, number> = {
  CL: 4480,
  PL: 4328,
  PD: 4335,
  SA: 4332,
  BL1: 4331,
  FL1: 4334,
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
  const joined = cleanWords(value).replace(/\s+/g, "");
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

function eventTimestamp(event: SportsDbEvent) {
  const value = event.strTimestamp || `${event.dateEvent || ""}T${event.strTime || "00:00:00"}`;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function eventScore(event: SportsDbEvent, match: FootballDataMatch) {
  const home = Math.max(
    teamSimilarity(event.strHomeTeam || "", match.homeTeam.name),
    teamSimilarity(event.strHomeTeam || "", match.homeTeam.shortName || ""),
  );
  const away = Math.max(
    teamSimilarity(event.strAwayTeam || "", match.awayTeam.name),
    teamSimilarity(event.strAwayTeam || "", match.awayTeam.shortName || ""),
  );
  const eventTime = eventTimestamp(event);
  const targetTime = new Date(match.utcDate).getTime();
  const timeBonus = eventTime && Math.abs(eventTime - targetTime) <= 6 * 60 * 60 * 1000 ? 0.25 : 0;
  return home + away + timeBonus;
}

function seasonFor(dateValue: string) {
  const date = new Date(dateValue);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

async function json<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function bestEvent(events: SportsDbEvent[], match: FootballDataMatch, minimum = 1.15) {
  let best: SportsDbEvent | null = null;
  let score = 0;
  for (const event of events) {
    const candidate = eventScore(event, match);
    if (candidate > score) {
      best = event;
      score = candidate;
    }
  }
  return score >= minimum ? best : null;
}

async function findSportsDbEvent(base: string, match: FootballDataMatch) {
  const date = match.utcDate.slice(0, 10);
  const homeShort = match.homeTeam.shortName || match.homeTeam.name;
  const awayShort = match.awayTeam.shortName || match.awayTeam.name;
  const titles = [
    `${homeShort}_vs_${awayShort}`,
    `${match.homeTeam.name}_vs_${match.awayTeam.name}`,
    `${canonicalTeam(match.homeTeam.name)}_vs_${canonicalTeam(match.awayTeam.name)}`,
  ]
    .map((value) => value.replace(/\s+/g, "_"))
    .filter(Boolean);

  for (const title of [...new Set(titles)]) {
    const data = await json<{ event?: SportsDbEvent[] | null; events?: SportsDbEvent[] | null }>(
      `${base}/searchevents.php?e=${encodeURIComponent(title)}&d=${date}`,
    );
    const event = bestEvent(data?.event ?? data?.events ?? [], match, 1.3);
    if (event) return event;
  }

  const leagueId = sportsDbLeagueIds[match.competition.code];
  if (leagueId) {
    const season = seasonFor(match.utcDate);
    const seasonData = await json<{ events?: SportsDbEvent[] | null }>(
      `${base}/eventsseason.php?id=${leagueId}&s=${encodeURIComponent(season)}`,
    );
    const event = bestEvent(
      (seasonData?.events ?? []).filter((candidate) => !candidate.dateEvent || candidate.dateEvent === date),
      match,
      1.15,
    );
    if (event) return event;
  }

  const dayData = await json<{ events?: SportsDbEvent[] | null }>(`${base}/eventsday.php?d=${date}&s=Soccer`);
  return bestEvent(dayData?.events ?? [], match, 1.15);
}

function footballDataStatus(match: FootballDataMatch) {
  if (match.status === "PAUSED") return "Ընդմիջում";
  if (match.status === "IN_PLAY") return match.minute ? `${match.minute}′` : "LIVE";
  if (match.status === "FINISHED" || match.status === "AWARDED") return "Ավարտված";
  if (match.status === "POSTPONED") return "Հետաձգված";
  if (match.status === "CANCELLED") return "Չեղարկված";
  if (match.status === "SUSPENDED") return "Կասեցված";
  return new Intl.DateTimeFormat("hy-AM", {
    timeZone: "Asia/Yerevan",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(match.utcDate));
}

function timelineLabel(item: SportsDbTimeline) {
  const value = `${item.strTimeline || ""} ${item.strTimelineDetail || ""} ${item.strComment || ""}`.toLowerCase();
  if (value.includes("own goal")) return "Ինքնագոլ";
  if (value.includes("missed penalty")) return "Չիրացված 11 մետրանոց";
  if (value.includes("penalty") && value.includes("goal")) return "Գոլ՝ 11 մետրանոցից";
  if (value.includes("goal")) return "Գոլ";
  if (value.includes("red card") || value.includes("red")) return "Կարմիր քարտ";
  if (value.includes("yellow card") || value.includes("yellow")) return "Դեղին քարտ";
  if (value.includes("substitution") || value.includes("subst")) return "Փոխարինում";
  if (value.includes("var")) return "VAR";
  return item.strTimelineDetail || item.strTimeline || "Իրադարձություն";
}

function statValue(rows: SportsDbStatistic[], names: string[], side: "home" | "away", percent = false) {
  const row = rows.find((item) => names.some((name) => (item.strStat || "").toLowerCase().includes(name)));
  const value = side === "home" ? row?.intHome : row?.intAway;
  if (value === null || value === undefined || value === "") return "—";
  const text = String(value);
  return percent && !text.includes("%") ? `${text}%` : text;
}

export async function getLiveMatchDetailsV2(id: string): Promise<LiveMatchDetail | null> {
  const footballDataId = id.replace(/^fd-/, "");
  if (!/^\d+$/.test(footballDataId)) return null;

  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  if (!runtime.FOOTBALL_DATA_TOKEN) return null;

  const footballResponse = await fetch(`https://api.football-data.org/v4/matches/${footballDataId}`, {
    headers: { "X-Auth-Token": runtime.FOOTBALL_DATA_TOKEN, Accept: "application/json" },
    cache: "no-store",
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
  const [eventData, timelineData, lineupData, statsData] = await Promise.all([
    json<{ events?: SportsDbEvent[] | null }>(`${base}/lookupevent.php?id=${eventId}`),
    json<{ timeline?: SportsDbTimeline[] | null }>(`${base}/lookuptimeline.php?id=${eventId}`),
    json<{ lineup?: SportsDbLineup[] | null }>(`${base}/lookuplineup.php?id=${eventId}`),
    json<{ eventstats?: SportsDbStatistic[] | null }>(`${base}/lookupeventstats.php?id=${eventId}`),
  ]);

  const fullEvent = eventData?.events?.[0] ?? event;
  const grouped = new Map<string, SportsDbLineup[]>();
  for (const row of lineupData?.lineup ?? []) {
    const team = row.strTeam || "Թիմ";
    grouped.set(team, [...(grouped.get(team) ?? []), row]);
  }

  const stats = statsData?.eventstats ?? [];
  const homeTeam = fullEvent.strHomeTeam || fd.homeTeam.name;
  const awayTeam = fullEvent.strAwayTeam || fd.awayTeam.name;

  return {
    match,
    venue: fullEvent.strVenue || event.strVenue || "Տվյալ չկա",
    referee: fullEvent.strReferee || fullEvent.strOfficial || event.strReferee || event.strOfficial || "Տվյալ չկա",
    events: (timelineData?.timeline ?? []).map((item) => ({
      minute: item.intTime === null || item.intTime === undefined ? "—" : `${item.intTime}′`,
      team: armenianTeamName(item.strTeam || "—"),
      player: item.strPlayer || "—",
      assist: item.strAssist || "—",
      label: timelineLabel(item),
    })),
    lineups: Array.from(grouped.entries()).map(([team, rows]) => ({
      team: armenianTeamName(team),
      formation: "—",
      starters: rows.filter((row) => !/yes|true|1/i.test(row.strSubstitute || "")).map((row) => row.strPlayer || "—"),
      substitutes: rows.filter((row) => /yes|true|1/i.test(row.strSubstitute || "")).map((row) => row.strPlayer || "—"),
    })),
    statistics: [
      {
        team: armenianTeamName(homeTeam),
        possession: statValue(stats, ["possession"], "home", true),
        shotsOnGoal: statValue(stats, ["shots on goal", "shots on target"], "home"),
        totalShots: statValue(stats, ["total shots"], "home"),
        xg: statValue(stats, ["expected goals", "expected_goals", "xg"], "home"),
      },
      {
        team: armenianTeamName(awayTeam),
        possession: statValue(stats, ["possession"], "away", true),
        shotsOnGoal: statValue(stats, ["shots on goal", "shots on target"], "away"),
        totalShots: statValue(stats, ["total shots"], "away"),
        xg: statValue(stats, ["expected goals", "expected_goals", "xg"], "away"),
      },
    ],
  };
}
