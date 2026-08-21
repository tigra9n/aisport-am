import { armenianTeamName } from "./team-names-hy";

export type LiveMatch = { id: string; status: string; competition: string; home: string; away: string; homeScore: number | null; awayScore: number | null; isLive: boolean };
export type LiveMatchDetail = {
  match: LiveMatch;
  venue: string;
  referee: string;
  events: { minute: string; team: string; player: string; assist: string; label: string }[];
  lineups: { team: string; formation: string; starters: string[]; substitutes: string[] }[];
  statistics: { team: string; possession: string; shotsOnGoal: string; totalShots: string; xg: string }[];
};

type SportsDbEvent = {
  idEvent: string; strLeague?: string | null; strCountry?: string | null;
  strHomeTeam?: string | null; strAwayTeam?: string | null;
  intHomeScore?: string | number | null; intAwayScore?: string | number | null;
  strStatus?: string | null; strProgress?: string | null; strTimestamp?: string | null;
  dateEvent?: string | null; strTime?: string | null; strVenue?: string | null; strReferee?: string | null;
};
type SportsDbTimeline = { intTime?: string | number | null; strTimeline?: string | null; strEvent?: string | null; strTeam?: string | null; strPlayer?: string | null; strAssist?: string | null; strDetail?: string | null };
type SportsDbLineup = { strTeam?: string | null; strPlayer?: string | null; strSubstitute?: string | null; strFormation?: string | null };
type SportsDbStatistic = { strTeam?: string | null; strStat?: string | null; intStat?: string | number | null };
type FootballDataMatch = {
  id: number; utcDate: string; status: string; minute?: number | null;
  competition: { code: string; name: string };
  homeTeam: { name: string; shortName?: string }; awayTeam: { name: string; shortName?: string };
  score: { fullTime?: { home: number | null; away: number | null }; regularTime?: { home: number | null; away: number | null } };
};
type SortableMatch = LiveMatch & { priority: number; timestamp: number };

let cacheTableReady: Promise<unknown> | null = null;
const inFlight = new Map<string, Promise<unknown>>();
const FREE_KEY = "123";

function formatYerevanDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Yerevan", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function yerevanDate(dayOffset = 0) {
  const [year, month, day] = formatYerevanDate(new Date()).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + dayOffset)).toISOString().slice(0, 10);
}

async function ensureCacheTable(db: D1Database) {
  cacheTableReady ??= db.prepare(`CREATE TABLE IF NOT EXISTS api_cache (
    cache_key TEXT PRIMARY KEY, payload TEXT NOT NULL DEFAULT '[]',
    saved_at INTEGER NOT NULL DEFAULT 0, retry_after INTEGER NOT NULL DEFAULT 0
  )`).run();
  await cacheTableReady;
}

async function cachedJson<T>(cacheKey: string, url: string, revalidate: number, allowRequest = true): Promise<T | null> {
  const { env } = await import("cloudflare:workers");
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) return null;
  await ensureCacheTable(db);
  const now = Date.now();
  const row = await db.prepare("SELECT payload, saved_at AS savedAt, retry_after AS retryAfter FROM api_cache WHERE cache_key = ?")
    .bind(cacheKey).first<{ payload: string; savedAt: number; retryAfter: number }>();
  const cached = () => { try { return row?.savedAt ? JSON.parse(row.payload) as T : null; } catch { return null; } };
  if (row?.savedAt && now - row.savedAt < revalidate * 1000) return cached();
  if (!allowRequest || (row?.retryAfter ?? 0) > now) return cached();
  const lock = await db.prepare(`INSERT INTO api_cache (cache_key, payload, saved_at, retry_after) VALUES (?, '[]', 0, ?)
    ON CONFLICT(cache_key) DO UPDATE SET retry_after = excluded.retry_after WHERE api_cache.retry_after <= ?`)
    .bind(cacheKey, now + 20_000, now).run();
  if ((lock.meta.changes ?? 0) === 0) return cached();
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      await db.prepare("UPDATE api_cache SET retry_after = ? WHERE cache_key = ?").bind(Date.now() + 60_000, cacheKey).run();
      return cached();
    }
    const payload = await response.json() as T;
    await db.prepare("UPDATE api_cache SET payload = ?, saved_at = ?, retry_after = 0 WHERE cache_key = ?")
      .bind(JSON.stringify(payload), Date.now(), cacheKey).run();
    return payload;
  } catch (error) {
    console.error("TheSportsDB request failed", error);
    await db.prepare("UPDATE api_cache SET retry_after = ? WHERE cache_key = ?").bind(Date.now() + 60_000, cacheKey).run();
    return cached();
  }
}

function fetchCached<T>(cacheKey: string, url: string, revalidate: number, allowRequest = true) {
  const requestKey = `${cacheKey}:${allowRequest}`;
  const current = inFlight.get(requestKey) as Promise<T | null> | undefined;
  if (current) return current;
  const request = cachedJson<T>(cacheKey, url, revalidate, allowRequest).finally(() => inFlight.delete(requestKey));
  inFlight.set(requestKey, request);
  return request;
}

function competitionDetails(nameValue?: string | null, countryValue?: string | null) {
  const name = (nameValue ?? "").trim().toLowerCase();
  const country = (countryValue ?? "").trim().toLowerCase();
  if (name.includes("champions league")) return { priority: 0, label: "Չեմպիոնների լիգա" };
  if (name.includes("europa league")) return { priority: 1, label: "Եվրոպա լիգա" };
  if (name.includes("conference league")) return { priority: 2, label: "Կոնֆերենցիաների լիգա" };
  if ((country.includes("england") || name.includes("english")) && name.includes("premier league")) return { priority: 3, label: "Անգլիայի Պրեմիեր լիգա" };
  if ((country.includes("spain") || name.includes("spanish")) && (name.includes("la liga") || name.includes("primera"))) return { priority: 4, label: "Իսպանիայի Լա Լիգա" };
  if ((country.includes("italy") || name.includes("italian")) && name.includes("serie a")) return { priority: 5, label: "Իտալիայի Սերիա Ա" };
  if ((country.includes("germany") || name.includes("german")) && name.includes("bundesliga")) return { priority: 6, label: "Գերմանիայի Բունդեսլիգա" };
  if ((country.includes("france") || name.includes("french")) && name.includes("ligue 1")) return { priority: 7, label: "Ֆրանսիայի Լիգա 1" };
  if ((country.includes("england") || name.includes("english")) && (name.includes("fa cup") || name.includes("efl cup") || name.includes("league cup"))) return { priority: 8, label: "Անգլիայի գավաթ" };
  if ((country.includes("spain") || name.includes("spanish")) && name.includes("copa del rey")) return { priority: 9, label: "Իսպանիայի գավաթ" };
  if ((country.includes("italy") || name.includes("italian")) && name.includes("coppa italia")) return { priority: 10, label: "Իտալիայի գավաթ" };
  if ((country.includes("germany") || name.includes("german")) && name.includes("dfb")) return { priority: 11, label: "Գերմանիայի գավաթ" };
  if ((country.includes("france") || name.includes("french")) && name.includes("coupe de france")) return { priority: 12, label: "Ֆրանսիայի գավաթ" };
  if ((country.includes("armenia") || name.includes("armenian")) && name.includes("premier league")) return { priority: 13, label: "Հայաստանի Պրեմիեր լիգա" };
  if ((country.includes("armenia") || name.includes("armenian")) && name.includes("cup")) return { priority: 14, label: "Հայաստանի գավաթ" };
  return null;
}

function eventTimestamp(event: SportsDbEvent) {
  const value = event.strTimestamp || `${event.dateEvent ?? ""}T${event.strTime || "00:00:00"}Z`;
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : 0;
}

function score(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function eventState(event: SportsDbEvent) {
  const value = `${event.strStatus ?? ""} ${event.strProgress ?? ""}`.trim().toLowerCase();
  const live = /live|in progress|1h|2h|half time|halftime|extra time|penalties/.test(value) && !/finished|final/.test(value);
  if (live) {
    if (/half time|halftime|\bht\b/.test(value)) return { status: "Ընդմիջում", live: true };
    const minute = value.match(/(\d{1,3})(?:'| min| minute)?/i)?.[1];
    return { status: minute ? `${minute}′` : "LIVE", live: true };
  }
  if (/finished|final|\bft\b|aet/.test(value)) return { status: "Ավարտված", live: false };
  if (/postponed/.test(value)) return { status: "Հետաձգված", live: false };
  if (/cancelled|canceled/.test(value)) return { status: "Չեղարկված", live: false };
  const timestamp = eventTimestamp(event);
  if (timestamp && timestamp < Date.now() - 3 * 60 * 60 * 1000 && (score(event.intHomeScore) !== null || score(event.intAwayScore) !== null)) return { status: "Ավարտված", live: false };
  return { status: timestamp ? new Intl.DateTimeFormat("hy-AM", { timeZone: "Asia/Yerevan", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(timestamp)) : "Ժամը կհստակեցվի", live: false };
}

function sportsDbMatch(event: SportsDbEvent): SortableMatch | null {
  const competition = competitionDetails(event.strLeague, event.strCountry);
  if (!competition || !event.idEvent || !event.strHomeTeam || !event.strAwayTeam) return null;
  const state = eventState(event);
  return { id: `tsdb-${event.idEvent}`, status: state.status, competition: competition.label,
    home: armenianTeamName(event.strHomeTeam), away: armenianTeamName(event.strAwayTeam),
    homeScore: score(event.intHomeScore), awayScore: score(event.intAwayScore), isLive: state.live,
    priority: competition.priority, timestamp: eventTimestamp(event) };
}

function publicMatch(item: SortableMatch): LiveMatch {
  return { id: item.id, status: item.status, competition: item.competition, home: item.home, away: item.away, homeScore: item.homeScore, awayScore: item.awayScore, isLive: item.isLive };
}

function footballDataCompetition(code: string) {
  const values: Record<string, { priority: number; label: string }> = {
    CL: { priority: 0, label: "Չեմպիոնների լիգա" }, PL: { priority: 3, label: "Անգլիայի Պրեմիեր լիգա" },
    PD: { priority: 4, label: "Իսպանիայի Լա Լիգա" }, SA: { priority: 5, label: "Իտալիայի Սերիա Ա" },
    BL1: { priority: 6, label: "Գերմանիայի Բունդեսլիգա" }, FL1: { priority: 7, label: "Ֆրանսիայի Լիգա 1" },
  };
  return values[code] ?? null;
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

async function footballDataMatches(token: string, date: string, allowRequest: boolean) {
  const { env } = await import("cloudflare:workers");
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) return null;
  await ensureCacheTable(db);
  const cacheKey = `football-data:${date}`;
  const row = await db.prepare("SELECT payload, saved_at AS savedAt FROM api_cache WHERE cache_key = ?").bind(cacheKey).first<{ payload: string; savedAt: number }>();
  const old = () => { try { return row?.savedAt ? JSON.parse(row.payload) as FootballDataMatch[] : null; } catch { return null; } };
  if (row?.savedAt && Date.now() - row.savedAt < 3_600_000) return old();
  if (!allowRequest) return old();
  try {
    const response = await fetch(`https://api.football-data.org/v4/matches?dateFrom=${date}&dateTo=${date}`, { headers: { "X-Auth-Token": token, Accept: "application/json" } });
    if (!response.ok) return old();
    const payload = await response.json() as { matches?: FootballDataMatch[] };
    const matches = payload.matches ?? [];
    await db.prepare(`INSERT INTO api_cache (cache_key, payload, saved_at, retry_after) VALUES (?, ?, ?, 0)
      ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, saved_at = excluded.saved_at, retry_after = 0`)
      .bind(cacheKey, JSON.stringify(matches), Date.now()).run();
    return matches;
  } catch { return old(); }
}

export async function getLiveMatches(dayOffset = 0, allowProviderRequest = true): Promise<{ matches: LiveMatch[]; demo: boolean; unavailable: boolean; limited: boolean; updatedAt: string }> {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  const key = runtime.THESPORTSDB_API_KEY || FREE_KEY;
  const date = yerevanDate(Number.isInteger(dayOffset) ? Math.max(-7, Math.min(7, dayOffset)) : 0);
  const updatedAt = new Intl.DateTimeFormat("hy-AM", { timeZone: "Asia/Yerevan", hour: "2-digit", minute: "2-digit" }).format(new Date());
  const [sportsDb, footballData] = await Promise.all([
    fetchCached<{ events?: SportsDbEvent[] | null }>(`thesportsdb:eventsday:${date}`, `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(key)}/eventsday.php?d=${date}&s=Soccer`, dayOffset === 0 ? 300 : 3_600, allowProviderRequest),
    runtime.FOOTBALL_DATA_TOKEN ? footballDataMatches(runtime.FOOTBALL_DATA_TOKEN, date, allowProviderRequest) : Promise.resolve(null),
  ]);
  const primary = (sportsDb?.events ?? []).map(sportsDbMatch).filter((item): item is SortableMatch => Boolean(item));
  const fallback = (footballData ?? []).map((item): SortableMatch | null => {
    const competition = footballDataCompetition(item.competition.code);
    if (!competition) return null;
    const result = item.score.fullTime ?? item.score.regularTime;
    return { id: `fd-${item.id}`, status: footballDataStatus(item), competition: competition.label,
      home: armenianTeamName(item.homeTeam.name || item.homeTeam.shortName || ""), away: armenianTeamName(item.awayTeam.name || item.awayTeam.shortName || ""),
      homeScore: result?.home ?? null, awayScore: result?.away ?? null, isLive: item.status === "IN_PLAY" || item.status === "PAUSED",
      priority: competition.priority, timestamp: new Date(item.utcDate).getTime() };
  }).filter((item): item is SortableMatch => Boolean(item));
  if (!sportsDb && !footballData) return { matches: [], demo: false, unavailable: true, limited: true, updatedAt };
  const merged = new Map<string, SortableMatch>();
  for (const item of [...fallback, ...primary]) merged.set(`${item.competition}|${item.home}|${item.away}`.toLowerCase(), item);
  const matches = Array.from(merged.values()).sort((a, b) => a.priority - b.priority || Number(b.isLive) - Number(a.isLive) || a.timestamp - b.timestamp);
  return { matches: matches.map(publicMatch), demo: false, unavailable: false, limited: key === FREE_KEY, updatedAt };
}

function timelineLabel(item: SportsDbTimeline) {
  const value = `${item.strTimeline ?? ""} ${item.strEvent ?? ""} ${item.strDetail ?? ""}`.toLowerCase();
  if (value.includes("own goal")) return "Ինքնագոլ";
  if (value.includes("missed penalty")) return "Չիրացված 11 մետրանոց";
  if (value.includes("penalty") && value.includes("goal")) return "Գոլ՝ 11 մետրանոցից";
  if (value.includes("goal")) return "Գոլ";
  if (value.includes("red")) return "Կարմիր քարտ";
  if (value.includes("yellow")) return "Դեղին քարտ";
  if (value.includes("substitution") || value.includes("subst")) return "Փոխարինում";
  if (value.includes("var")) return "VAR";
  return item.strTimeline || item.strEvent || item.strDetail || "Իրադարձություն";
}

function statValue(rows: SportsDbStatistic[], team: string, names: string[]) {
  const item = rows.find((row) => (row.strTeam ?? "").toLowerCase() === team.toLowerCase() && names.some((name) => (row.strStat ?? "").toLowerCase().includes(name)));
  return item?.intStat === null || item?.intStat === undefined ? "—" : String(item.intStat);
}

export async function getLiveMatchDetails(id: string): Promise<LiveMatchDetail | null> {
  const eventId = id.replace(/^tsdb-/, "");
  if (!/^\d+$/.test(eventId)) return null;
  const { env } = await import("cloudflare:workers");
  const key = (env as unknown as Record<string, string | undefined>).THESPORTSDB_API_KEY || FREE_KEY;
  const base = `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(key)}`;
  const [eventData, timelineData, lineupData, statsData] = await Promise.all([
    fetchCached<{ events?: SportsDbEvent[] | null }>(`thesportsdb:event:${eventId}`, `${base}/lookupevent.php?id=${eventId}`, 300),
    fetchCached<{ timeline?: SportsDbTimeline[] | null }>(`thesportsdb:timeline:${eventId}`, `${base}/lookuptimeline.php?id=${eventId}`, 300),
    fetchCached<{ lineup?: SportsDbLineup[] | null }>(`thesportsdb:lineup:${eventId}`, `${base}/lookuplineup.php?id=${eventId}`, 1_800),
    fetchCached<{ eventstats?: SportsDbStatistic[] | null }>(`thesportsdb:stats:${eventId}`, `${base}/lookupeventstats.php?id=${eventId}`, 300),
  ]);
  const event = eventData?.events?.[0];
  if (!event) return null;
  const sortable = sportsDbMatch(event);
  if (!sortable) return null;
  const match = publicMatch(sortable);
  const grouped = new Map<string, SportsDbLineup[]>();
  for (const row of lineupData?.lineup ?? []) {
    const team = row.strTeam || "Թիմ";
    grouped.set(team, [...(grouped.get(team) ?? []), row]);
  }
  const stats = statsData?.eventstats ?? [];
  const teams = [event.strHomeTeam || "Տանտեր", event.strAwayTeam || "Հյուր"];
  return {
    match, venue: event.strVenue || "Տվյալ չկա", referee: event.strReferee || "Տվյալ չկա",
    events: (timelineData?.timeline ?? []).map((item) => ({ minute: item.intTime == null ? "—" : `${item.intTime}′`, team: armenianTeamName(item.strTeam || "—"), player: item.strPlayer || "—", assist: item.strAssist || "—", label: timelineLabel(item) })),
    lineups: Array.from(grouped.entries()).map(([team, rows]) => ({ team: armenianTeamName(team), formation: rows.find((row) => row.strFormation)?.strFormation || "—", starters: rows.filter((row) => !/yes|true|1/i.test(row.strSubstitute || "")).map((row) => row.strPlayer || "—"), substitutes: rows.filter((row) => /yes|true|1/i.test(row.strSubstitute || "")).map((row) => row.strPlayer || "—") })),
    statistics: teams.map((team) => ({ team: armenianTeamName(team), possession: statValue(stats, team, ["possession"]), shotsOnGoal: statValue(stats, team, ["shots on goal", "shots on target"]), totalShots: statValue(stats, team, ["total shots", "shots"]), xg: statValue(stats, team, ["expected goals", "xg"]) })),
  };
}
