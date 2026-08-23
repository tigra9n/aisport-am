import { armenianTeamName } from "./team-names-hy";

export type LiveMatch={id:string;status:string;competition:string;home:string;away:string;homeScore:number|null;awayScore:number|null;isLive:boolean};
export type LineupPlayer={name:string;number:number|null;grid:string|null};
export type LiveMatchDetail={match:LiveMatch;venue:string;referee:string;events:{minute:string;team:string;player:string;assist:string;label:string}[];lineups:{team:string;formation:string;starters:LineupPlayer[];substitutes:LineupPlayer[]}[];statistics:{team:string;possession:string;shotsOnGoal:string;totalShots:string;xg:string}[]};

type ApiFootballFixture={fixture:{id:number;date:string;venue?:{name?:string|null};referee?:string|null;status:{short:string;elapsed?:number|null}};league:{id:number};teams:{home:{name:string};away:{name:string}};goals:{home:number|null;away:number|null}};
type SortableMatch=LiveMatch&{priority:number;timestamp:number};

let cacheTableReady:Promise<unknown>|null=null;
const inFlight=new Map<string,Promise<unknown>>();

function formatYerevanDate(date:Date){const p=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Yerevan",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);const v=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${v.year}-${v.month}-${v.day}`}
function yerevanDate(dayOffset=0){const [y,m,d]=formatYerevanDate(new Date()).split("-").map(Number);return new Date(Date.UTC(y,m-1,d+dayOffset)).toISOString().slice(0,10)}

async function ensureCacheTable(db:D1Database){cacheTableReady??=db.prepare(`CREATE TABLE IF NOT EXISTS api_cache (cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL DEFAULT '[]',saved_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)`).run();await cacheTableReady}

async function cachedFetch<T>(cacheKey:string,url:string,headers:Record<string,string>,revalidateSeconds:number,allowRequest:boolean):Promise<T|null>{
  const {env}=await import("cloudflare:workers");
  const db=(env as unknown as {DB?:D1Database}).DB;
  if(!db)return null;
  await ensureCacheTable(db);
  const now=Date.now();
  const row=await db.prepare("SELECT payload,saved_at AS savedAt FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{payload:string;savedAt:number}>();
  const cached=()=>{try{return row?.savedAt?JSON.parse(row.payload) as T:null}catch{return null}};
  if(row?.savedAt&&now-row.savedAt<revalidateSeconds*1000)return cached();
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
      if(hasErrors)return cached();
      await db.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0`).bind(cacheKey,JSON.stringify(payload),Date.now()).run();
      return payload;
    }catch{return cached()}
  })().finally(()=>inFlight.delete(requestKey));
  inFlight.set(requestKey,run);
  return run;
}

const TRACKED_LEAGUES:Record<number,{priority:number;label:string}>={
  2:{priority:0,label:"Չեմպիոնների լիգա"},
  3:{priority:1,label:"Եվրոպա լիգա"},
  4:{priority:2,label:"Կոնֆերենցիա լիգա"},
  39:{priority:3,label:"Անգլիայի Պրեմիեր լիգա"},
  140:{priority:4,label:"Իսպանիայի Լա Լիգա"},
  135:{priority:5,label:"Իտալիայի Սերիա Ա"},
  78:{priority:6,label:"Գերմանիայի Բունդեսլիգա"},
  61:{priority:7,label:"Ֆրանսիայի Լիգա 1"},
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
  const label=statusLabel(fx.fixture.status)??new Intl.DateTimeFormat("hy-AM",{timeZone:"Asia/Yerevan",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(fx.fixture.date));
  return{
    id:`af-${fx.fixture.id}`,
    status:label,
    competition:league.label,
    home:armenianTeamName(fx.teams.home.name),
    away:armenianTeamName(fx.teams.away.name),
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
  const updatedAt=new Intl.DateTimeFormat("hy-AM",{timeZone:"Asia/Yerevan",hour:"2-digit",minute:"2-digit"}).format(new Date());
  const key=runtime.API_FOOTBALL_KEY;
  if(!key)return{matches:[],demo:false,unavailable:true,limited:true,updatedAt};
  const ttl=dayOffset===0?480:1800;
  const data=await cachedFetch<{response?:ApiFootballFixture[]}>(
    `apifootball:v2:date:${date}`,
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
