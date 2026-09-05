import { formatTimeYerevan } from "./format-date";
import { armenianTeamName } from "./team-names-hy";

export type LiveMatch={id:string;status:string;competition:string;home:string;away:string;homeId:number|null;awayId:number|null;homeLogo:string|null;awayLogo:string|null;homeScore:number|null;awayScore:number|null;isLive:boolean};
export type LineupPlayer={id:number|null;name:string;number:number|null;grid:string|null;rating:string|null};
export type LiveMatchDetail={match:LiveMatch;venue:string;referee:string;events:{minute:string;team:string;player:string;assist:string;label:string}[];lineups:{team:string;formation:string;starters:LineupPlayer[];substitutes:LineupPlayer[]}[];statistics:{team:string;possession:string;shotsOnGoal:string;totalShots:string;xg:string}[];h2h:{date:string;competition:string;home:string;away:string;homeScore:number|null;awayScore:number|null}[];prediction:{winnerName:string|null;comment:string|null;advice:string|null;homePct:string;drawPct:string;awayPct:string}|null;standings:import("./football").StandingRow[]|null;topScorers:import("./topscorers-server").TopScorer[]|null;injuries:{team:string;player:string;reason:string}[];formGuide:{team:string;form:string;played:number;won:number;draw:number;lost:number;goalsForAvg:string;goalsAgainstAvg:string;cleanSheets:number}[]};

type ApiFootballFixture={fixture:{id:number;date:string;venue?:{name?:string|null};referee?:string|null;status:{short:string;elapsed?:number|null}};league:{id:number};teams:{home:{id:number;name:string;logo?:string|null};away:{id:number;name:string;logo?:string|null}};goals:{home:number|null;away:number|null}};
type SortableMatch=LiveMatch&{priority:number;timestamp:number};

let cacheTableReady:Promise<unknown>|null=null;
const inFlight=new Map<string,Promise<unknown>>();

function formatYerevanDate(date:Date){const p=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Yerevan",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);const v=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${v.year}-${v.month}-${v.day}`}
function yerevanDate(dayOffset=0){const [y,m,d]=formatYerevanDate(new Date()).split("-").map(Number);return new Date(Date.UTC(y,m-1,d+dayOffset)).toISOString().slice(0,10)}

async function ensureCacheTable(db:D1Database){cacheTableReady??=db.prepare(`CREATE TABLE IF NOT EXISTS api_cache (cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL DEFAULT '[]',saved_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)`).run();await cacheTableReady}

// How long to stop asking after the provider refuses.
//
// 5 September, 20:00 Yerevan: the Armenian league sat at "- : -" through a
// match while the English games beside it ticked along. The provider was
// answering every call with {"requests":"You have reached the request limit
// for the day"} - a 200 response carrying an error - and this cache treated
// that like any other failure: serve the stale copy, leave saved_at alone,
// and therefore ask again on the very next page view. Once the daily
// allowance was gone the site asked for it forever, several times a minute,
// which is the one thing guaranteed not to bring it back.
//
// The api_cache table has carried a retry_after column all along; this is
// the first caller to use it.
//
// Half an hour for a spent daily allowance, deliberately, rather than
// sleeping until whenever the allowance is believed to reset. The provider
// does not say whether that is midnight UTC or a rolling twenty-four hours
// from the first call, and betting on midnight costs a whole day of scores
// if the guess is wrong: we would wake, be refused once more, and sleep
// again until the next midnight. Probing every thirty minutes recovers
// within half an hour of the real reset whenever it happens, and spends at
// most forty-eight calls a day doing it - against an allowance of 7500.
function refusalBackoffMs(errs:unknown):number{
  if(!errs||typeof errs!=="object"||Array.isArray(errs))return 0;
  const entry=errs as Record<string,unknown>;
  const text=Object.values(entry).map(String).join(" ").toLowerCase();
  if("requests" in entry||text.includes("limit for the day"))return 30*60_000;
  if("rateLimit" in entry||text.includes("rate limit"))return 60_000;
  return 0;
}

async function cachedFetch<T>(cacheKey:string,url:string,headers:Record<string,string>,revalidateSeconds:number,allowRequest:boolean):Promise<T|null>{
  const {env}=await import("cloudflare:workers");
  const db=(env as unknown as {DB?:D1Database}).DB;
  if(!db)return null;
  await ensureCacheTable(db);
  const now=Date.now();
  const row=await db.prepare("SELECT payload,saved_at AS savedAt,retry_after AS retryAfter FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{payload:string;savedAt:number;retryAfter:number}>();
  const cached=()=>{try{return row?.savedAt?JSON.parse(row.payload) as T:null}catch{return null}};
  if(row?.savedAt&&now-row.savedAt<revalidateSeconds*1000)return cached();
  // Still inside a refusal: serve what we have rather than spend another
  // call learning the same thing.
  if(row?.retryAfter&&now<row.retryAfter)return cached();
  if(!allowRequest)return cached();
  const requestKey=`req:${cacheKey}`;
  const existing=inFlight.get(requestKey) as Promise<T|null>|undefined;
  if(existing)return existing;
  const run=(async()=>{
    try{
      const r=await fetch(url,{headers:{...headers,Accept:"application/json"}});
      if(!r.ok)return cached();
      const payload=await r.json() as T & {errors?:unknown};
      const errs=(payload as {errors?:unknown})?.errors;
      const hasErrors=Array.isArray(errs)?errs.length>0:Boolean(errs&&Object.keys(errs as object).length>0);
      if(hasErrors){
        const backoff=refusalBackoffMs(errs);
        if(backoff>0){
          // Only the backoff is written. The payload and saved_at belong to
          // the last answer that actually contained football.
          await db.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,'null',0,?) ON CONFLICT(cache_key) DO UPDATE SET retry_after=excluded.retry_after`).bind(cacheKey,Date.now()+backoff).run();
        }
        return cached();
      }
      await db.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0`).bind(cacheKey,JSON.stringify(payload),Date.now()).run();
      return payload;
    }catch{return cached()}
  })().finally(()=>inFlight.delete(requestKey));
  inFlight.set(requestKey,run);
  return run;
}

const TRACKED_LEAGUES:Record<number,{priority:number;label:string}>={
  342:{priority:0,label:"Հայաստանի Պրեմիեր լիգա"},
  709:{priority:0,label:"Հայաստանի գավաթ"},
  2:{priority:1,label:"Չեմպիոնների լիգա"},
  3:{priority:2,label:"Եվրոպա լիգա"},
  4:{priority:3,label:"Կոնֆերենցիա լիգա"},
  39:{priority:4,label:"Անգլիայի Պրեմիեր լիգա"},
  45:{priority:5,label:"Անգլիայի գավաթ (FA Cup)"},
  48:{priority:6,label:"Անգլիայի լիգայի գավաթ"},
  140:{priority:7,label:"Իսպանիայի Լա Լիգա"},
  143:{priority:8,label:"Իսպանիայի գավաթ (Copa del Rey)"},
  135:{priority:9,label:"Իտալիայի Սերիա Ա"},
  137:{priority:10,label:"Իտալիայի գավաթ (Coppa Italia)"},
  78:{priority:11,label:"Գերմանիայի Բունդեսլիգա"},
  81:{priority:12,label:"Գերմանիայի գավաթ (DFB Pokal)"},
  61:{priority:13,label:"Ֆրանսիայի Լիգա 1"},
  66:{priority:14,label:"Ֆրանսիայի գավաթ (Coupe de France)"},
  253:{priority:15,label:"MLS"},
  307:{priority:16,label:"Սաուդյան Արաբիայի պրոֆեսիոնալ լիգա"},
};

function statusLabel(status:{short:string;elapsed?:number|null}){
  const s=status.short;
  if(s==="1H"||s==="2H"||s==="ET"||s==="P"||s==="LIVE")return status.elapsed?`${status.elapsed}′`:"LIVE";
  if(s==="HT")return"Ընդմիջում";
  if(s==="FT"||s==="AET"||s==="PEN")return"Ավարտված";
  if(s==="PST")return"Հետաձգված";
  if(s==="CANC"||s==="ABD"||s==="AWD"||s==="WO")return"Չեղարկված";
  if(s==="SUSP"||s==="INT")return"Կասեցված";
  return null;
}
function isLiveStatus(short:string){return["1H","2H","ET","P","LIVE","HT","BT"].includes(short)}

function toSortable(fx:ApiFootballFixture):SortableMatch|null{
  const league=TRACKED_LEAGUES[fx.league.id];
  if(!league)return null;
  const label=statusLabel(fx.fixture.status)??formatTimeYerevan(fx.fixture.date);
  return{
    id:`af-${fx.fixture.id}`,
    status:label,
    competition:league.label,
    home:armenianTeamName(fx.teams.home.name),
    away:armenianTeamName(fx.teams.away.name),
    homeId:fx.teams.home.id??null,
    awayId:fx.teams.away.id??null,
    homeLogo:fx.teams.home.logo??null,
    awayLogo:fx.teams.away.logo??null,
    homeScore:fx.goals.home,
    awayScore:fx.goals.away,
    isLive:isLiveStatus(fx.fixture.status.short),
    priority:league.priority,
    timestamp:new Date(fx.fixture.date).getTime(),
  };
}

export async function getLiveMatches(dayOffset=0,allowProviderRequest=true){
  const {env}=await import("cloudflare:workers");
  const runtime=env as unknown as Record<string,string|undefined>;
  const date=yerevanDate(Number.isInteger(dayOffset)?Math.max(-7,Math.min(7,dayOffset)):0);
  const updatedAt=formatTimeYerevan(new Date());
  const key=runtime.API_FOOTBALL_KEY;
  if(!key)return{matches:[],demo:false,unavailable:true,limited:true,updatedAt};
  const ttl=dayOffset===0?480:1800;
  const data=await cachedFetch<{response?:ApiFootballFixture[]}>(
    `apifootball:v3:date:${date}`,
    `https://v3.football.api-sports.io/fixtures?date=${date}`,
    {"x-apisports-key":key},
    ttl,
    allowProviderRequest,
  );
  if(!data)return{matches:[],demo:false,unavailable:true,limited:true,updatedAt};
  const matches=(data.response??[])
    .map(toSortable)
    .filter((x):x is SortableMatch=>Boolean(x))
    .sort((a,b)=>a.priority-b.priority||Number(b.isLive)-Number(a.isLive)||a.timestamp-b.timestamp);
  return{matches:matches.map(({priority,timestamp,...m})=>m),demo:false,unavailable:false,limited:false,updatedAt};
}
