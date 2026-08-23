import { armenianTeamName } from "./team-names-hy";
import type { LiveMatch, LiveMatchDetail } from "./live-football-server";

type ApiFootballFixtureFull={fixture:{id:number;date:string;venue?:{name?:string|null};referee?:string|null;status:{short:string;elapsed?:number|null}};league:{id:number};teams:{home:{name:string};away:{name:string}};goals:{home:number|null;away:number|null}};
type ApiFootballEvent={time:{elapsed:number;extra?:number|null};team:{name:string};player:{name?:string|null};assist:{name?:string|null};type:string;detail:string};
type ApiFootballLineupPlayer={player:{name?:string|null;number?:number|null;grid?:string|null}};
type ApiFootballLineup={team:{name:string};formation?:string|null;startXI:ApiFootballLineupPlayer[];substitutes:ApiFootballLineupPlayer[]};
type ApiFootballStatItem={type:string;value:string|number|null};
type ApiFootballStatistics={team:{name:string};statistics:ApiFootballStatItem[]};

const TRACKED_LEAGUES:Record<number,string>={
  342:"Հայաստանի Պրեմիեր լիգա",
  709:"Հայաստանի գավաթ",
  2:"Չեմպիոնների լիգա",
  3:"Եվրոպա լիգա",
  4:"Կոնֆերենցիա լիգա",
  39:"Անգլիայի Պրեմիեր լիգա",
  45:"Անգլիայի գավաթ (FA Cup)",
  48:"Անգլիայի լիգայի գավաթ",
  140:"Իսպանիայի Լա Լիգա",
  143:"Իսպանիայի գավաթ (Copa del Rey)",
  135:"Իտալիայի Սերիա Ա",
  137:"Իտալիայի գավաթ (Coppa Italia)",
  78:"Գերմանիայի Բունդեսլիգա",
  81:"Գերմանիայի գավաթ (DFB Pokal)",
  61:"Ֆրանսիայի Լիգա 1",
  66:"Ֆրանսիայի գավաթ (Coupe de France)",
};

let cacheTableReady:Promise<unknown>|null=null;

async function ensureCacheTable(db:D1Database){cacheTableReady??=db.prepare(`CREATE TABLE IF NOT EXISTS api_cache (cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL DEFAULT '[]',saved_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)`).run();await cacheTableReady}

async function fetchJson<T>(url:string,key:string):Promise<T|null>{
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(url,{headers:{"x-apisports-key":key,Accept:"application/json"},cache:"no-store"});
      if(response.status===429){
        if(attempt<2){await new Promise(r=>setTimeout(r,600));continue}
        console.error(`[live-match-details] 429 rate limit on ${url}`);
        return null;
      }
      if(!response.ok){
        if(attempt<2){await new Promise(r=>setTimeout(r,300));continue}
        return null;
      }
      const payload=await response.json() as T & {errors?:unknown};
      const errs=(payload as {errors?:unknown})?.errors;
      const isRateLimit=Boolean(errs&&typeof errs==="object"&&!Array.isArray(errs)&&"rateLimit" in (errs as object));
      const hasErrors=Array.isArray(errs)?errs.length>0:Boolean(errs&&Object.keys(errs as object).length>0);
      if(hasErrors){
        if(attempt<2){await new Promise(r=>setTimeout(r,isRateLimit?600:300));continue}
        if(isRateLimit)console.error(`[live-match-details] rate limit error field on ${url}`);
        return null;
      }
      return payload;
    }catch{
      if(attempt<2){await new Promise(r=>setTimeout(r,300));continue}
      return null;
    }
  }
  return null;
}

async function readCache(db:D1Database,cacheKey:string):Promise<LiveMatchDetail|null>{
  const row=await db.prepare("SELECT payload,retry_after AS validUntil FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{payload:string;validUntil:number}>();
  if(!row||Date.now()>row.validUntil)return null;
  try{return JSON.parse(row.payload) as LiveMatchDetail}catch{return null}
}
async function readStaleCache(db:D1Database,cacheKey:string):Promise<LiveMatchDetail|null>{
  const row=await db.prepare("SELECT payload FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{payload:string}>();
  try{return row?JSON.parse(row.payload) as LiveMatchDetail:null}catch{return null}
}
async function writeCache(db:D1Database,cacheKey:string,value:LiveMatchDetail,finished:boolean){
  // Finished matches never change again, so cache them for a long time.
  // Live or not-yet-started matches get a short TTL since state changes fast.
  const ttlSeconds=finished?60*60*6:240;
  const validUntil=Date.now()+ttlSeconds*1000;
  await db.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=excluded.retry_after`).bind(cacheKey,JSON.stringify(value),Date.now(),validUntil).run();
}

// Lineups are announced ~1h before kickoff and essentially never change once published,
// unlike score/events/stats. Caching them separately with a long TTL avoids re-fetching
// (and re-spending API quota on) the lineups endpoint on every refresh cycle.
type CachedLineups=LiveMatchDetail["lineups"];
async function readLineupsCache(db:D1Database,cacheKey:string):Promise<CachedLineups|null>{
  const row=await db.prepare("SELECT payload,retry_after AS validUntil FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{payload:string;validUntil:number}>();
  if(!row||Date.now()>row.validUntil)return null;
  try{return JSON.parse(row.payload) as CachedLineups}catch{return null}
}
async function writeLineupsCache(db:D1Database,cacheKey:string,value:CachedLineups){
  const validUntil=Date.now()+60*60*6*1000;
  await db.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=excluded.retry_after`).bind(cacheKey,JSON.stringify(value),Date.now(),validUntil).run();
}

function statusLabel(status:{short:string;elapsed?:number|null}){
  const s=status.short;
  if(s==="1H"||s==="2H"||s==="ET"||s==="P"||s==="LIVE")return status.elapsed?`${status.elapsed}′`:"LIVE";
  if(s==="HT")return"Ընդմիջում";
  if(s==="FT"||s==="AET"||s==="PEN")return"Ավարտված";
  if(s==="PST")return"Հետաձգված";
  if(s==="CANC"||s==="ABD"||s==="AWD"||s==="WO")return"Չեղարկված";
  if(s==="SUSP"||s==="INT")return"Կասեցված";
  return new Intl.DateTimeFormat("hy-AM",{timeZone:"Asia/Yerevan",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date());
}
function isLiveStatus(short:string){return["1H","2H","ET","P","LIVE","HT","BT"].includes(short)}
function isFinishedStatus(short:string){return["FT","AET","PEN","CANC","PST","ABD","AWD","WO"].includes(short)}

function eventLabel(type:string,detail:string){
  const t=`${type} ${detail}`.toLowerCase();
  if(t.includes("own goal"))return"Ինքնագոլ";
  if(t.includes("missed penalty"))return"Չիրացված 11 մետրանոց";
  if(t.includes("penalty"))return"Գոլ՝ 11 մետրանոցից";
  if(t.includes("goal"))return"Գոլ";
  if(t.includes("red card"))return"Կարմիր քարտ";
  if(t.includes("yellow card"))return"Դեղին քարտ";
  if(t.includes("subst"))return"Փոխարինում";
  if(t.includes("var"))return"VAR";
  return detail||type||"Իրադարձություն";
}

function statValue(rows:ApiFootballStatItem[],names:string[]){
  const row=rows.find(r=>names.some(n=>(r.type||"").toLowerCase().includes(n)));
  if(row===undefined||row.value===null||row.value===undefined||row.value==="")return"—";
  return String(row.value);
}

export async function getLiveMatchDetailsV2(id:string):Promise<LiveMatchDetail|null>{
  const fixtureId=id.replace(/^af-/,"").replace(/^fd-/,"");
  if(!/^\d+$/.test(fixtureId))return null;

  const {env}=await import("cloudflare:workers");
  const runtime=env as unknown as Record<string,string|undefined>;
  const key=runtime.API_FOOTBALL_KEY;
  if(!key)return null;
  const db=(env as unknown as {DB?:D1Database}).DB;

  const cacheKey=`apifootball:v6:match:${fixtureId}`;
  if(db){
    await ensureCacheTable(db);
    const fresh=await readCache(db,cacheKey);
    if(fresh)return fresh;
  }

  const fixtureData=await fetchJson<{response?:ApiFootballFixtureFull[]}>(`https://v3.football.api-sports.io/fixtures?id=${fixtureId}`,key);
  const fx=fixtureData?.response?.[0];
  if(!fx){
    if(db){const stale=await readStaleCache(db,cacheKey);if(stale)return stale}
    return null;
  }
  const competition=TRACKED_LEAGUES[fx.league.id];
  if(!competition)return null;

  const match:LiveMatch={
    id:`af-${fx.fixture.id}`,
    status:statusLabel(fx.fixture.status),
    competition,
    home:armenianTeamName(fx.teams.home.name),
    away:armenianTeamName(fx.teams.away.name),
    homeScore:fx.goals.home,
    awayScore:fx.goals.away,
    isLive:isLiveStatus(fx.fixture.status.short),
  };

  const lineupsCacheKey=`apifootball:v5:lineups:${fixtureId}`;
  const cachedLineups=db?await readLineupsCache(db,lineupsCacheKey):null;
  // Both teams must be present. An hour before kickoff it's common for only one
  // side to have published its XI; caching that half-result would otherwise pin
  // the popup to a single team's lineup for the rest of the match.
  const needLineupsFetch=!cachedLineups||cachedLineups.length<2;

  // Firing all three requests to the same host at once is unreliable from
  // within a Worker (each succeeds fine on its own via a plain curl, but
  // concurrent fetches to the same host intermittently drop). Fetch them
  // one at a time instead — Pro-tier quota easily covers the extra latency.
  const eventsData=await fetchJson<{response?:ApiFootballEvent[]}>(`https://v3.football.api-sports.io/fixtures/events?fixture=${fixtureId}`,key);
  const lineupsData=needLineupsFetch?await fetchJson<{response?:ApiFootballLineup[]}>(`https://v3.football.api-sports.io/fixtures/lineups?fixture=${fixtureId}`,key):null;
  const statsData=await fetchJson<{response?:ApiFootballStatistics[]}>(`https://v3.football.api-sports.io/fixtures/statistics?fixture=${fixtureId}`,key);

  const freshLineups=(lineupsData?.response??[]).map(l=>({
    team:armenianTeamName(l.team.name),
    formation:l.formation||"—",
    starters:l.startXI.map(p=>({name:p.player.name||"—",number:p.player.number??null,grid:p.player.grid??null})),
    substitutes:l.substitutes.map(p=>({name:p.player.name||"—",number:p.player.number??null,grid:p.player.grid??null})),
  }));
  // If the refetch came back empty (e.g. rate-limited), fall back to whatever we had.
  const lineups=needLineupsFetch?(freshLineups.length>0?freshLineups:(cachedLineups??[])):(cachedLineups as CachedLineups);
  if(db&&needLineupsFetch&&freshLineups.length>=2)await writeLineupsCache(db,lineupsCacheKey,freshLineups);

  const result:LiveMatchDetail={
    match,
    venue:fx.fixture.venue?.name||"Տվյալ չկա",
    referee:fx.fixture.referee||"Տվյալ չկա",
    events:(eventsData?.response??[]).map(e=>({
      minute:e.time.extra?`${e.time.elapsed}+${e.time.extra}′`:`${e.time.elapsed}′`,
      team:armenianTeamName(e.team.name),
      player:e.player.name||"—",
      assist:e.assist.name||"—",
      label:eventLabel(e.type,e.detail),
    })),
    lineups,
    statistics:(statsData?.response??[]).map(s=>({
      team:armenianTeamName(s.team.name),
      possession:statValue(s.statistics,["ball possession"]),
      shotsOnGoal:statValue(s.statistics,["shots on goal","shots on target"]),
      totalShots:statValue(s.statistics,["total shots"]),
      xg:statValue(s.statistics,["expected goals","xg"]),
    })),
  };

  if(db){
    const looksIncomplete=result.events.length===0||result.lineups.length===0||result.statistics.length===0;
    const finished=isFinishedStatus(fx.fixture.status.short)&&!looksIncomplete;
    await writeCache(db,cacheKey,result,finished);
  }

  return result;
}
