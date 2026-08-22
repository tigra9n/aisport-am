import { armenianTeamName } from "./team-names-hy";
import type { LiveMatch, LiveMatchDetail } from "./live-football-server";

type ApiFootballFixtureFull={fixture:{id:number;date:string;venue?:{name?:string|null};referee?:string|null;status:{short:string;elapsed?:number|null}};league:{id:number};teams:{home:{name:string};away:{name:string}};goals:{home:number|null;away:number|null}};
type ApiFootballEvent={time:{elapsed:number;extra?:number|null};team:{name:string};player:{name?:string|null};assist:{name?:string|null};type:string;detail:string};
type ApiFootballLineupPlayer={player:{name?:string|null}};
type ApiFootballLineup={team:{name:string};formation?:string|null;startXI:{player:ApiFootballLineupPlayer["player"]}[];substitutes:{player:ApiFootballLineupPlayer["player"]}[]};
type ApiFootballStatItem={type:string;value:string|number|null};
type ApiFootballStatistics={team:{name:string};statistics:ApiFootballStatItem[]};

const TRACKED_LEAGUES:Record<number,string>={
  2:"Չեմպիոնների լիգա",
  39:"Անգլիայի Պրեմիեր լիգա",
  140:"Իսպանիայի Լա Լիգա",
  135:"Իտալիայի Սերիա Ա",
  78:"Գերմանիայի Բունդեսլիգա",
  61:"Ֆրանսիայի Լիգա 1",
};

let cacheTableReady:Promise<unknown>|null=null;

async function ensureCacheTable(db:D1Database){cacheTableReady??=db.prepare(`CREATE TABLE IF NOT EXISTS api_cache (cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL DEFAULT '[]',saved_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)`).run();await cacheTableReady}

async function fetchJson<T>(url:string,key:string):Promise<T|null>{
  try{
    const response=await fetch(url,{headers:{"x-apisports-key":key,Accept:"application/json"},cache:"no-store"});
    if(!response.ok)return null;
    const payload=await response.json() as T & {errors?:unknown};
    const errs=(payload as {errors?:unknown})?.errors;
    const hasErrors=Array.isArray(errs)?errs.length>0:Boolean(errs&&Object.keys(errs as object).length>0);
    if(hasErrors)return null;
    return payload;
  }catch{return null}
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
  const ttlSeconds=finished?60*60*6:90;
  const validUntil=Date.now()+ttlSeconds*1000;
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

  const cacheKey=`apifootball:match:${fixtureId}`;
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

  const [eventsData,lineupsData,statsData]=await Promise.all([
    fetchJson<{response?:ApiFootballEvent[]}>(`https://v3.football.api-sports.io/fixtures/events?fixture=${fixtureId}`,key),
    fetchJson<{response?:ApiFootballLineup[]}>(`https://v3.football.api-sports.io/fixtures/lineups?fixture=${fixtureId}`,key),
    fetchJson<{response?:ApiFootballStatistics[]}>(`https://v3.football.api-sports.io/fixtures/statistics?fixture=${fixtureId}`,key),
  ]);

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
    lineups:(lineupsData?.response??[]).map(l=>({
      team:armenianTeamName(l.team.name),
      formation:l.formation||"—",
      starters:l.startXI.map(p=>p.player.name||"—"),
      substitutes:l.substitutes.map(p=>p.player.name||"—"),
    })),
    statistics:(statsData?.response??[]).map(s=>({
      team:armenianTeamName(s.team.name),
      possession:statValue(s.statistics,["ball possession"]),
      shotsOnGoal:statValue(s.statistics,["shots on goal","shots on target"]),
      totalShots:statValue(s.statistics,["total shots"]),
      xg:statValue(s.statistics,["expected goals","xg"]),
    })),
  };

  if(db){
    await writeCache(db,cacheKey,result,isFinishedStatus(fx.fixture.status.short));
  }

  return result;
}
