import { formatDateYerevan, formatTimeYerevan } from "./format-date";
import { armenianCompetition } from "./names-hy";
import { armenianPlayerName } from "./player-names-hy";
import { armenianTeamName } from "./team-names-hy";
import type { LiveMatch, LiveMatchDetail, LineupPlayer } from "./live-football-server";
import { getStandings } from "./football-server";
import { getTopScorers } from "./topscorers-server";

const LEAGUE_CODE_BY_ID:Record<number,string>={39:"PL",140:"PD",135:"SA",78:"BL1",61:"FL1",307:"SPL",253:"MLS"};

type ApiFootballFixtureFull={fixture:{id:number;date:string;venue?:{name?:string|null};referee?:string|null;status:{short:string;elapsed?:number|null}};league:{id:number};teams:{home:{id:number;name:string;logo?:string|null};away:{id:number;name:string;logo?:string|null}};goals:{home:number|null;away:number|null}};
type ApiFootballEvent={time:{elapsed:number;extra?:number|null};team:{name:string};player:{name?:string|null};assist:{name?:string|null};type:string;detail:string};
type ApiFootballLineupPlayer={player:{id?:number|null;name?:string|null;number?:number|null;grid?:string|null}};
type ApiFootballLineup={team:{name:string};formation?:string|null;startXI:ApiFootballLineupPlayer[];substitutes:ApiFootballLineupPlayer[]};
type ApiFootballStatItem={type:string;value:string|number|null};
type ApiFootballStatistics={team:{name:string};statistics:ApiFootballStatItem[]};
type ApiFootballH2HFixture={fixture:{id:number;date:string;status:{short:string}};league:{id:number;name:string};teams:{home:{name:string};away:{name:string}};goals:{home:number|null;away:number|null}};
type ApiFootballPredictions={response?:[{
  predictions:{winner:{name:string|null;comment:string|null}|null;win_or_draw:boolean;advice:string|null;percent:{home:string;draw:string;away:string}};
  teams:{home:{name:string};away:{name:string}};
}]};

type ApiFootballPlayerStats={team:{name:string};players:{player:{name:string};statistics:[{games:{rating:string|null}}]}[]};
type ApiFootballInjury={player:{name:string};team:{name:string};player_reason?:string|null;reason?:string|null};

type ApiFootballTeamStats={
  form:string|null;
  fixtures:{played:{total:number};wins:{total:number};draws:{total:number};loses:{total:number}};
  goals:{for:{average:{total:string}};against:{average:{total:string}}};
  clean_sheet:{total:number};
};

type EventsSection=LiveMatchDetail["events"];
type LineupsSection=LiveMatchDetail["lineups"];
type StatsSection=LiveMatchDetail["statistics"];
type H2HSection=LiveMatchDetail["h2h"];
type PredictionSection=LiveMatchDetail["prediction"];
type InjuriesSection=LiveMatchDetail["injuries"];
type RatingsSection=Record<string,string>;
type FormGuideSection=LiveMatchDetail["formGuide"];

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
  253:"MLS",
  307:"Սաուդյան Արաբիայի պրոֆեսիոնալ լիգա",
};

let cacheTableReady:Promise<unknown>|null=null;
async function ensureCacheTable(db:D1Database){cacheTableReady??=db.prepare(`CREATE TABLE IF NOT EXISTS api_cache (cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL DEFAULT '[]',saved_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)`).run();await cacheTableReady}

async function fetchJson<T>(url:string,key:string):Promise<T|null>{
  for(let attempt=0;attempt<4;attempt++){
    try{
      const response=await fetch(url,{headers:{"x-apisports-key":key,Accept:"application/json"},cache:"no-store"});
      if(response.status===429){
        if(attempt<3){await new Promise(r=>setTimeout(r,700));continue}
        return null;
      }
      if(!response.ok){
        if(attempt<3){await new Promise(r=>setTimeout(r,350));continue}
        return null;
      }
      const payload=await response.json() as T & {errors?:unknown};
      const errs=(payload as {errors?:unknown})?.errors;
      const isRateLimit=Boolean(errs&&typeof errs==="object"&&!Array.isArray(errs)&&"rateLimit" in (errs as object));
      const hasErrors=Array.isArray(errs)?errs.length>0:Boolean(errs&&Object.keys(errs as object).length>0);
      if(hasErrors){
        // A spent daily allowance is not a transient failure, and the three
        // retries below turned every match dialog into four refused calls
        // instead of one. Nothing resets in 700ms; give up at once and let
        // the caller serve its cached sections.
        const spentForTheDay=Boolean(errs&&typeof errs==="object"&&!Array.isArray(errs)
          &&("requests" in (errs as object)
            ||Object.values(errs as Record<string,unknown>).map(String).join(" ").toLowerCase().includes("limit for the day")));
        if(spentForTheDay)return null;
        if(attempt<3){await new Promise(r=>setTimeout(r,isRateLimit?700:350));continue}
        return null;
      }
      return payload;
    }catch{
      if(attempt<3){await new Promise(r=>setTimeout(r,350));continue}
      return null;
    }
  }
  return null;
}

// Generic per-section cache: each section (fixture info, events, lineups,
// statistics) is stored and expired independently, so one section failing
// to fetch never wipes out or blocks the others from being served/reused.
// Reads several cache keys in a single D1 round trip instead of one await
// per key — this is the fast path when everything is already warm.
async function readSectionsBatch(db:D1Database,keys:string[]):Promise<Map<string,{payload:string;validUntil:number}>>{
  const statements=keys.map(k=>db.prepare("SELECT payload,retry_after AS validUntil FROM api_cache WHERE cache_key=?").bind(k));
  const results=await db.batch<{payload:string;validUntil:number}>(statements);
  const map=new Map<string,{payload:string;validUntil:number}>();
  keys.forEach((k,i)=>{
    const row=results[i]?.results?.[0];
    if(row)map.set(k,row);
  });
  return map;
}
function parseSection<T>(row:{payload:string;validUntil:number}|undefined):{value:T;fresh:boolean}|null{
  if(!row)return null;
  try{
    const value=JSON.parse(row.payload) as T;
    return{value,fresh:Date.now()<=row.validUntil};
  }catch{return null}
}
async function readSection<T>(db:D1Database,cacheKey:string):Promise<{value:T;fresh:boolean}|null>{
  const row=await db.prepare("SELECT payload,retry_after AS validUntil FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{payload:string;validUntil:number}>();
  return parseSection<T>(row??undefined);
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
  if(finished)return populated?60*60*6:60*3;
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
  return formatTimeYerevan(new Date());
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
    // The same spelling as the lineup uses. The modal matches a card or a
    // substitution to a player on the pitch by comparing these strings, so
    // translating one side and not the other would silently stop the yellow
    // and red markers, and the substitution arrows, from appearing at all.
    player:armenianPlayerName(e.player.name)||"—",
    assist:armenianPlayerName(e.assist.name)||"—",
    label:eventLabel(e.type,e.detail),
  }));
}
function mapLineups(data:{response?:ApiFootballLineup[]}|null,ratings:RatingsSection):LineupsSection{
  return(data?.response??[]).map(l=>({
    team:armenianTeamName(l.team.name),
    formation:l.formation||"—",
    starters:l.startXI.map((p):LineupPlayer=>({id:p.player.id??null,name:armenianPlayerName(p.player.name)||"—",number:p.player.number??null,grid:p.player.grid??null,rating:p.player.name?ratings[p.player.name]??null:null})),
    substitutes:l.substitutes.map((p):LineupPlayer=>({id:p.player.id??null,name:armenianPlayerName(p.player.name)||"—",number:p.player.number??null,grid:p.player.grid??null,rating:p.player.name?ratings[p.player.name]??null:null})),
  }));
}
function mapRatings(data:{response?:ApiFootballPlayerStats[]}|null):RatingsSection{
  const ratings:RatingsSection={};
  for(const team of data?.response??[]){
    for(const entry of team.players){
      const rating=entry.statistics[0]?.games.rating;
      if(entry.player.name&&rating)ratings[entry.player.name]=Number(rating).toFixed(1);
    }
  }
  return ratings;
}
function mapInjuries(data:{response?:ApiFootballInjury[]}|null):InjuriesSection{
  return(data?.response??[]).map(i=>({
    team:armenianTeamName(i.team.name),
    player:armenianPlayerName(i.player.name),
    reason:i.player_reason||i.reason||"Վնասվածք",
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
function mapH2H(data:{response?:ApiFootballH2HFixture[]}|null):H2HSection{
  return(data?.response??[])
    .filter(fx=>fx.fixture.status.short==="FT"||fx.fixture.status.short==="AET"||fx.fixture.status.short==="PEN")
    .sort((a,b)=>new Date(b.fixture.date).getTime()-new Date(a.fixture.date).getTime())
    .slice(0,5)
    .map(fx=>({
      date:formatDateYerevan(fx.fixture.date),
      competition:armenianCompetition(fx.league.name),
      home:armenianTeamName(fx.teams.home.name),
      away:armenianTeamName(fx.teams.away.name),
      homeScore:fx.goals.home,
      awayScore:fx.goals.away,
    }));
}
function mapPrediction(data:ApiFootballPredictions|null):PredictionSection{
  const entry=data?.response?.[0];
  if(!entry)return null;
  const {predictions}=entry;
  return{
    winnerName:predictions.winner?.name?armenianTeamName(predictions.winner.name):null,
    comment:predictions.winner?.comment??null,
    advice:predictions.advice??null,
    homePct:predictions.percent.home,
    drawPct:predictions.percent.draw,
    awayPct:predictions.percent.away,
  };
}

function mapFormGuide(teamName:string,data:{response?:ApiFootballTeamStats}|null):FormGuideSection[number]|null{
  const stats=data?.response;
  if(!stats)return null;
  return{
    team:teamName,
    form:(stats.form||"").slice(-5),
    played:stats.fixtures.played.total,
    won:stats.fixtures.wins.total,
    draw:stats.fixtures.draws.total,
    lost:stats.fixtures.loses.total,
    goalsForAvg:stats.goals.for.average.total,
    goalsAgainstAvg:stats.goals.against.average.total,
    cleanSheets:stats.clean_sheet.total,
  };
}

// Fetch+cache one section. `precached` comes from an earlier batched D1
// read; if it's already fresh we skip the network entirely. Otherwise we
// fetch, and only overwrite the cache if the fetch actually returned
// something (a transient failure keeps whatever was cached before, so a
// previously-successful section is never wiped out by a later flaky call).
async function resolveSection<T>(
  db:D1Database|undefined,
  cacheKey:string,
  finished:boolean,
  precached:{value:T;fresh:boolean}|null,
  isEmpty:(v:T)=>boolean,
  fetcher:()=>Promise<T>,
):Promise<T>{
  if(precached?.fresh)return precached.value;
  const cached=precached;
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
  // The board now carries matches from two providers and the id says which:
  // "espn-eng.1-401879286" against the old "af-1234567". ESPN answers a
  // whole match page in one free request where this file spends eight to
  // ten paid ones, so anything it owns goes to it and never comes back
  // here. Armenian matches keep the "af-" prefix and the path below,
  // because ESPN does not carry that league.
  if(id.startsWith("espn-")){
    try{
      const {espnLiveMatchDetail}=await import("./espn");
      return await espnLiveMatchDetail(id);
    }catch{return null}
  }
  const fixtureId=id.replace(/^af-/,"").replace(/^fd-/,"");
  if(!/^\d+$/.test(fixtureId))return null;

  const {env}=await import("cloudflare:workers");
  const runtime=env as unknown as Record<string,string|undefined>;
  const key=runtime.API_FOOTBALL_KEY;
  if(!key)return null;
  const db=(env as unknown as {DB?:D1Database}).DB;

  const fixtureCacheKey=`apifootball:v9:fixture:${fixtureId}`;
  const eventsCacheKey=`apifootball:v11:events:${fixtureId}`;
  const lineupsCacheKey=`apifootball:v12:lineups:${fixtureId}`;
  const statsCacheKey=`apifootball:v9:stats:${fixtureId}`;
  const predictionCacheKey=`apifootball:v9:prediction:${fixtureId}`;
  const ratingsCacheKey=`apifootball:v9:ratings:${fixtureId}`;
  const injuriesCacheKey=`apifootball:v10:injuries:${fixtureId}`;

  // BUG FIXED: the previous version always speculatively fetched the
  // fixture externally in parallel with the cache batch-read, even when
  // cache turned out to be fresh - api-sports.io's own response time is
  // highly variable (observed 0.3-3+ seconds call to call), and since
  // Promise.all waits for the slowest member, every single request -
  // warm cache included - was paying that external-call latency even
  // when the fetched result was immediately discarded in favor of the
  // fresh cached value. This explained the erratic, inconsistent timing
  // seen even on "warm" repeat calls to the same match. Now the external
  // fetch only happens when cache is actually stale or missing.
  const [batch]=await Promise.all([
    db?readSectionsBatch(db,[fixtureCacheKey,eventsCacheKey,lineupsCacheKey,statsCacheKey,predictionCacheKey,ratingsCacheKey,injuriesCacheKey]):Promise.resolve(new Map<string,{payload:string;validUntil:number}>()),
    db?ensureCacheTable(db):Promise.resolve(),
  ]);
  const cachedFixture=parseSection<ApiFootballFixtureFull>(batch.get(fixtureCacheKey));
  const cachedEvents=parseSection<EventsSection>(batch.get(eventsCacheKey));
  const cachedLineups=parseSection<LineupsSection>(batch.get(lineupsCacheKey));
  const cachedStats=parseSection<StatsSection>(batch.get(statsCacheKey));
  const cachedPrediction=parseSection<PredictionSection>(batch.get(predictionCacheKey));
  const cachedRatings=parseSection<RatingsSection>(batch.get(ratingsCacheKey));
  const cachedInjuries=parseSection<InjuriesSection>(batch.get(injuriesCacheKey));

  let fx:ApiFootballFixtureFull|null=null;
  if(cachedFixture?.fresh){
    fx=cachedFixture.value;
  }else{
    const fixtureData=await fetchJson<{response?:ApiFootballFixtureFull[]}>(`https://v3.football.api-sports.io/fixtures?id=${fixtureId}`,key);
    fx=fixtureData?.response?.[0]??null;
    if(fx){
      const finishedNow=isFinishedStatus(fx.fixture.status.short);
      if(db)await writeSection(db,fixtureCacheKey,fx,finishedNow?60*60*6:60);
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
    homeId:fx.teams.home.id??null,
    awayId:fx.teams.away.id??null,
    homeLogo:fx.teams.home.logo??null,
    awayLogo:fx.teams.away.logo??null,
    homeScore:fx.goals.home,
    awayScore:fx.goals.away,
    isLive:isLiveStatus(fx.fixture.status.short),
  };

  // These sections are all independent of each other (only lineups needs
  // the resolved ratings value) but were previously fetched one at a
  // time with sequential awaits - on a cold cache (first time this match
  // is opened, or after TTL expiry) that meant up to 7 sequential
  // external API round-trips (200-600ms each) before the popup could
  // render anything, which is what made it feel slow to open. Running
  // them together cuts that to roughly the duration of the single
  // slowest call instead of the sum of all of them.
  const teamPairKey=[fx.teams.home.id,fx.teams.away.id].sort((a,b)=>a-b).join("-");
  const h2hCacheKey=`apifootball:v10:h2h:${teamPairKey}`;
  const leagueCode=LEAGUE_CODE_BY_ID[fx.league.id];
  const seasonYear=(()=>{const d=new Date(fx.fixture.date);const m=d.getUTCMonth()+1;return m>=7?d.getUTCFullYear():d.getUTCFullYear()-1})();
  const formGuideCacheKeyFor=(teamId:number)=>`apifootball:v1:form:${fx.league.id}:${seasonYear}:${teamId}`;
  const apiKey:string=key;
  async function resolveFormGuide(teamId:number,teamName:string):Promise<FormGuideSection[number]|null>{
    if(!db)return mapFormGuide(teamName,await fetchJson<{response?:ApiFootballTeamStats}>(`https://v3.football.api-sports.io/teams/statistics?league=${fx!.league.id}&season=${seasonYear}&team=${teamId}`,apiKey));
    const cacheKey=formGuideCacheKeyFor(teamId);
    const cached=await readSection<FormGuideSection[number]>(db,cacheKey);
    if(cached?.fresh)return cached.value;
    const result=mapFormGuide(teamName,await fetchJson<{response?:ApiFootballTeamStats}>(`https://v3.football.api-sports.io/teams/statistics?league=${fx!.league.id}&season=${seasonYear}&team=${teamId}`,apiKey));
    if(result)await writeSection(db,cacheKey,result,finished?60*60*6:60*30);
    return result??cached?.value??null;
  }

  const ratingsPromise=resolveSection<RatingsSection>(
    db,ratingsCacheKey,finished,cachedRatings,
    v=>Object.keys(v).length===0,
    async()=>mapRatings(await fetchJson<{response?:ApiFootballPlayerStats[]}>(`https://v3.football.api-sports.io/fixtures/players?fixture=${fixtureId}`,key)),
  );

  const [events,ratings,statistics,injuries,prediction,h2h,lineups,[standingsResult,topScorersResult],homeForm,awayForm]=await Promise.all([
    resolveSection<EventsSection>(
      db,eventsCacheKey,finished,cachedEvents,
      v=>v.length===0,
      async()=>mapEvents(await fetchJson<{response?:ApiFootballEvent[]}>(`https://v3.football.api-sports.io/fixtures/events?fixture=${fixtureId}`,key)),
    ),
    ratingsPromise,
    resolveSection<StatsSection>(
      db,statsCacheKey,finished,cachedStats,
      v=>v.length===0,
      async()=>mapStatistics(await fetchJson<{response?:ApiFootballStatistics[]}>(`https://v3.football.api-sports.io/fixtures/statistics?fixture=${fixtureId}`,key)),
    ),
    // Injuries are pre-match info (who's ruled out) and barely change once
    // set, so the standard section TTL policy works well here too.
    resolveSection<InjuriesSection>(
      db,injuriesCacheKey,finished,cachedInjuries,
      v=>v.length===0,
      async()=>mapInjuries(await fetchJson<{response?:ApiFootballInjury[]}>(`https://v3.football.api-sports.io/injuries?fixture=${fixtureId}`,key)),
    ),
    // Predictions are generated pre-match and don't meaningfully change once
    // the match is underway, so cache them long-term regardless of status.
    resolveSection<PredictionSection>(
      db,predictionCacheKey,true,cachedPrediction,
      v=>v===null,
      async()=>mapPrediction(await fetchJson<ApiFootballPredictions>(`https://v3.football.api-sports.io/predictions?fixture=${fixtureId}`,key)),
    ),
    // Head-to-head history is keyed by the team pair (not the fixture), so
    // it can be reused across every future meeting between these two teams.
    (async()=>{
      const cachedH2H=db?await readSection<H2HSection>(db,h2hCacheKey):null;
      return resolveSection<H2HSection>(
        db,h2hCacheKey,true,cachedH2H,
        v=>v.length===0,
        async()=>mapH2H(await fetchJson<{response?:ApiFootballH2HFixture[]}>(`https://v3.football.api-sports.io/fixtures/headtohead?h2h=${fx!.teams.home.id}-${fx!.teams.away.id}&last=5`,key)),
      );
    })(),
    // Lineups' own network fetch runs immediately in parallel with
    // everything else here - it only needs ratings' resolved value for
    // the final synchronous mapLineups() formatting step, not to start
    // the request itself.
    resolveSection<LineupsSection>(
      db,lineupsCacheKey,finished,cachedLineups,
      v=>v.length<2,
      async()=>{
        const [lineupsData,ratingsValue]=await Promise.all([
          fetchJson<{response?:ApiFootballLineup[]}>(`https://v3.football.api-sports.io/fixtures/lineups?fixture=${fixtureId}`,key),
          ratingsPromise,
        ]);
        return mapLineups(lineupsData,ratingsValue);
      },
    ),
    // Standings and top scorers only make sense for the 5 domestic leagues
    // (cups/CL don't have a simple table). These functions already manage
    // their own caching, so just call them directly.
    leagueCode?Promise.all([getStandings(leagueCode),getTopScorers(leagueCode)]):Promise.resolve([null,null] as const),
    resolveFormGuide(fx.teams.home.id,match.home),
    resolveFormGuide(fx.teams.away.id,match.away),
  ]);

  const standings=standingsResult&&!standingsResult.demo?standingsResult.rows:null;
  const topScorers=topScorersResult&&!topScorersResult.unavailable?topScorersResult.rows:null;
  const formGuide=[homeForm,awayForm].filter((f):f is FormGuideSection[number]=>f!==null);

  return{
    match,
    venue:fx.fixture.venue?.name||"Տվյալ չկա",
    referee:fx.fixture.referee||"Տվյալ չկա",
    events,
    lineups,
    statistics,
    h2h,
    prediction,
    standings,
    topScorers,
    injuries,
    formGuide,
  };
}
