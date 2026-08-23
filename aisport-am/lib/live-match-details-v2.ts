import { armenianTeamName } from "./team-names-hy";
import type { LiveMatch, LiveMatchDetail, LineupPlayer } from "./live-football-server";

type ApiFootballFixtureFull={fixture:{id:number;date:string;venue?:{name?:string|null};referee?:string|null;status:{short:string;elapsed?:number|null}};league:{id:number};teams:{home:{name:string};away:{name:string}};goals:{home:number|null;away:number|null}};
type ApiFootballEvent={time:{elapsed:number;extra?:number|null};team:{name:string};player:{name?:string|null};assist:{name?:string|null};type:string;detail:string};
type ApiFootballLineupPlayer={player:{name?:string|null;number?:number|null;grid?:string|null}};
type ApiFootballLineup={team:{name:string};formation?:string|null;startXI:ApiFootballLineupPlayer[];substitutes:ApiFootballLineupPlayer[]};
type ApiFootballStatItem={type:string;value:string|number|null};
type ApiFootballStatistics={team:{name:string};statistics:ApiFootballStatItem[]};

type EventsSection=LiveMatchDetail["events"];
type LineupsSection=LiveMatchDetail["lineups"];
type StatsSection=LiveMatchDetail["statistics"];

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
        if(attempt<2){await new Promise(r=>setTimeout(r,700));continue}
        return null;
      }
      if(!response.ok){
        if(attempt<2){await new Promise(r=>setTimeout(r,350));continue}
        return null;
      }
      const payload=await response.json() as T & {errors?:unknown};
      const errs=(payload as {errors?:unknown})?.errors;
      const isRateLimit=Boolean(errs&&typeof errs==="object"&&!Array.isArray(errs)&&"rateLimit" in (errs as object));
      const hasErrors=Array.isArray(errs)?errs.length>0:Boolean(errs&&Object.keys(errs as object).length>0);
      if(hasErrors){
        if(attempt<2){await new Promise(r=>setTimeout(r,isRateLimit?700:350));continue}
        return null;
      }
      return payload;
    }catch{
      if(attempt<2){await new Promise(r=>setTimeout(r,350));continue}
      return null;
    }
  }
  return null;
}

// Generic per-section cache: each section (fixture info, events, lineups,
// statistics) is stored and expired independently, so one section failing
// to fetch never wipes out or blocks the others from being served/reused.
async function readSection<T>(db:D1Database,cacheKey:string):Promise<{value:T;fresh:boolean}|null>{
  const row=await db.prepare("SELECT payload,retry_after AS validUntil FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{payload:string;validUntil:number}>();
  if(!row)return null;
  try{
    const value=JSON.parse(row.payload) as T;
    return{value,fresh:Date.now()<=row.validUntil};
  }catch{return null}
}
async function writeSection<T>(db:D1Database,cacheKey:string,value:T,ttlSeconds:number){
  const validUntil=Date.now()+ttlSeconds*1000;
  await db.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=excluded.retry_after`).bind(cacheKey,JSON.stringify(value),Date.now(),validUntil).run();
}

// TTL policy per section, given whether the match is finished and whether
// the freshly-fetched data is non-empty:
//  - finished + populated  -> 6h (never changes again)
//  - finished + empty      -> 30min (confirmed gap for this competition; don't hammer, but allow recovery)
//  - live/upcoming         -> 60s (state changes fast either way)
function sectionTtl(finished:boolean,populated:boolean){
  if(finished)return populated?60*60*6:60*30;
  return 60;
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

function mapEvents(data:{response?:ApiFootballEvent[]}|null):EventsSection{
  return(data?.response??[]).map(e=>({
    minute:e.time.extra?`${e.time.elapsed}+${e.time.extra}′`:`${e.time.elapsed}′`,
    team:armenianTeamName(e.team.name),
    player:e.player.name||"—",
    assist:e.assist.name||"—",
    label:eventLabel(e.type,e.detail),
  }));
}
function mapLineups(data:{response?:ApiFootballLineup[]}|null):LineupsSection{
  return(data?.response??[]).map(l=>({
    team:armenianTeamName(l.team.name),
    formation:l.formation||"—",
    starters:l.startXI.map((p):LineupPlayer=>({name:p.player.name||"—",number:p.player.number??null,grid:p.player.grid??null})),
    substitutes:l.substitutes.map((p):LineupPlayer=>({name:p.player.name||"—",number:p.player.number??null,grid:p.player.grid??null})),
  }));
}
function mapStatistics(data:{response?:ApiFootballStatistics[]}|null):StatsSection{
  return(data?.response??[]).map(s=>({
    team:armenianTeamName(s.team.name),
    possession:statValue(s.statistics,["ball possession"]),
    shotsOnGoal:statValue(s.statistics,["shots on goal","shots on target"]),
    totalShots:statValue(s.statistics,["total shots"]),
    xg:statValue(s.statistics,["expected goals","xg"]),
  }));
}

// Fetch+cache one section: reuse a fresh cached value if present; otherwise
// fetch, and only overwrite the cache if the fetch actually returned
// something (a transient failure keeps whatever was cached before, so a
// previously-successful section is never wiped out by a later flaky call).
async function resolveSection<T>(
  db:D1Database|undefined,
  cacheKey:string,
  finished:boolean,
  isEmpty:(v:T)=>boolean,
  fetcher:()=>Promise<T>,
):Promise<T>{
  const cached=db?await readSection<T>(db,cacheKey):null;
  if(cached?.fresh)return cached.value;
  const result=await fetcher();
  const gotSomething=!isEmpty(result);
  if(db){
    if(gotSomething){
      // Real data: cache it (long TTL if the match is finished).
      await writeSection(db,cacheKey,result,sectionTtl(finished,true));
    }else if(cached&&!isEmpty(cached.value)){
      // This fetch came back empty but we previously had real data — keep
      // serving the good cached value; just retry again soon rather than
      // erasing known-good data because of one flaky call.
      await writeSection(db,cacheKey,cached.value,60);
    }else{
      // Confirmed empty (or first attempt failed): cache the empty result
      // so we don't hammer the API every single request for data that may
      // genuinely not exist, but still retry periodically in case it's transient.
      await writeSection(db,cacheKey,result,sectionTtl(finished,false));
    }
  }
  if(gotSomething)return result;
  return cached&&!isEmpty(cached.value)?cached.value:result;
}

export async function getLiveMatchDetailsV2(id:string):Promise<LiveMatchDetail|null>{
  const fixtureId=id.replace(/^af-/,"").replace(/^fd-/,"");
  if(!/^\d+$/.test(fixtureId))return null;

  const {env}=await import("cloudflare:workers");
  const runtime=env as unknown as Record<string,string|undefined>;
  const key=runtime.API_FOOTBALL_KEY;
  if(!key)return null;
  const db=(env as unknown as {DB?:D1Database}).DB;
  if(db)await ensureCacheTable(db);

  const fixtureCacheKey=`apifootball:v8:fixture:${fixtureId}`;
  let fx:ApiFootballFixtureFull|null=null;
  const cachedFixture=db?await readSection<ApiFootballFixtureFull>(db,fixtureCacheKey):null;
  if(cachedFixture?.fresh){
    fx=cachedFixture.value;
  }else{
    const fixtureData=await fetchJson<{response?:ApiFootballFixtureFull[]}>(`https://v3.football.api-sports.io/fixtures?id=${fixtureId}`,key);
    fx=fixtureData?.response?.[0]??null;
    if(fx){
      const finished=isFinishedStatus(fx.fixture.status.short);
      if(db)await writeSection(db,fixtureCacheKey,fx,finished?60*60*6:60);
    }else if(cachedFixture){
      fx=cachedFixture.value;
    }
  }
  if(!fx)return null;
  const competition=TRACKED_LEAGUES[fx.league.id];
  if(!competition)return null;
  const finished=isFinishedStatus(fx.fixture.status.short);

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

  const events=await resolveSection<EventsSection>(
    db,`apifootball:v8:events:${fixtureId}`,finished,
    v=>v.length===0,
    async()=>mapEvents(await fetchJson<{response?:ApiFootballEvent[]}>(`https://v3.football.api-sports.io/fixtures/events?fixture=${fixtureId}`,key)),
  );
  const lineups=await resolveSection<LineupsSection>(
    db,`apifootball:v8:lineups:${fixtureId}`,finished,
    v=>v.length<2,
    async()=>mapLineups(await fetchJson<{response?:ApiFootballLineup[]}>(`https://v3.football.api-sports.io/fixtures/lineups?fixture=${fixtureId}`,key)),
  );
  const statistics=await resolveSection<StatsSection>(
    db,`apifootball:v8:stats:${fixtureId}`,finished,
    v=>v.length===0,
    async()=>mapStatistics(await fetchJson<{response?:ApiFootballStatistics[]}>(`https://v3.football.api-sports.io/fixtures/statistics?fixture=${fixtureId}`,key)),
  );

  return{
    match,
    venue:fx.fixture.venue?.name||"Տվյալ չկա",
    referee:fx.fixture.referee||"Տվյալ չկա",
    events,
    lineups,
    statistics,
  };
}
