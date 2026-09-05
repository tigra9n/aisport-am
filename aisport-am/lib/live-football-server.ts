import { formatTimeYerevan } from "./format-date";

// Only the handful of fields the Armenian live overlay reads. The full
// API-Football fixture type went out with the rest of that provider's path;
// this is what is left of it.
type ArmenianLiveFixture={fixture:{status:{short:string;elapsed?:number|null}};league:{id:number};teams:{home:{name:string}};goals:{home:number|null;away:number|null}};

export type LiveMatch={id:string;status:string;competition:string;home:string;away:string;homeId:number|null;awayId:number|null;homeKey?:string|null;awayKey?:string|null;homeLogo:string|null;awayLogo:string|null;homeScore:number|null;awayScore:number|null;isLive:boolean};
export type LineupPlayer={id:number|null;name:string;number:number|null;grid:string|null;rating:string|null};
// The optional fields at the end arrived with ESPN, which sends more than
// the paid provider ever did: every team statistic it measures rather than
// the four the layout was built around, what each named player actually did
// in the match, and the minute-by-minute commentary. They are optional
// because the API-Football path still fills this same shape and has none of
// them.
export type LiveMatchDetail={match:LiveMatch;venue:string;referee:string;events:{minute:string;team:string;player:string;assist:string;label:string}[];lineups:{team:string;formation:string;starters:LineupPlayer[];substitutes:LineupPlayer[]}[];statistics:{team:string;possession:string;shotsOnGoal:string;totalShots:string;xg:string}[];h2h:{date:string;competition:string;home:string;away:string;homeScore:number|null;awayScore:number|null}[];prediction:{winnerName:string|null;comment:string|null;advice:string|null;homePct:string;drawPct:string;awayPct:string}|null;standings:import("./football").StandingRow[]|null;topScorers:import("./topscorers-server").TopScorer[]|null;injuries:{team:string;player:string;reason:string}[];formGuide:{team:string;form:string;played:number;won:number;draw:number;lost:number;goalsForAvg:string;goalsAgainstAvg:string;cleanSheets:number}[];
  // Every statistic the provider measured, home against away, in the order
  // a reader expects rather than the provider's. Replaces the fixed four
  // when present.
  statRows?:{label:string;home:string;away:string}[];
  // What each player did, keyed by name, so the lineup can say more than
  // who was on the pitch.
  playerLines?:Record<string,{label:string;value:number}[]>;
  // Minute by minute, and who wrote it. The text is the provider's own, not
  // a fact, so the page names them beside it.
  commentary?:{minute:string;text:string}[];
  commentarySource?:string|null};

let cacheTableReady:Promise<unknown>|null=null;

function formatYerevanDate(date:Date){const p=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Yerevan",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);const v=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${v.year}-${v.month}-${v.day}`}
function yerevanDate(dayOffset=0){const [y,m,d]=formatYerevanDate(new Date()).split("-").map(Number);return new Date(Date.UTC(y,m-1,d+dayOffset)).toISOString().slice(0,10)}

async function ensureCacheTable(db:D1Database){cacheTableReady??=db.prepare(`CREATE TABLE IF NOT EXISTS api_cache (cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL DEFAULT '[]',saved_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)`).run();await cacheTableReady}

// What used to live here: the API-Football fixture type, its league table,
// its status vocabulary, and cachedFetch with the refusal backoff written
// on 5 September after the daily allowance ran out mid-evening and the
// site asked for it several times a minute for hours.
//
// All of it is gone because this file no longer talks to a paid provider.
// The backoff mattered against a quota; ESPN publishes none and
// TheSportsDB is handled by caching on a window. If a paid provider ever
// comes back, that reasoning is in the history of this file, not lost.

export async function getLiveMatches(dayOffset=0,allowProviderRequest=true){
  const {env}=await import("cloudflare:workers");
  const date=yerevanDate(Number.isInteger(dayOffset)?Math.max(-7,Math.min(7,dayOffset)):0);
  const updatedAt=formatTimeYerevan(new Date());
  const ttl=dayOffset===0?480:1800;

  // ESPN carries every competition on this board except the Armenian ones,
  // it is free, and it answers this Worker in about a tenth of a second.
  // Measured from the deployed site rather than from a runner, because
  // site.api.espn.com refuses Cloudflare's addresses outright while
  // site.web.api.espn.com does not.
  //
  // The two sources are merged rather than one replacing the other: the
  // Armenian league is why this site exists and ESPN's own list of 218
  // soccer leagues does not contain it. Armenia keeps the paid provider and
  // sorts to the top, as it always has.
  const espnMatches=await (async()=>{
    try{
      const {espnMatchesForDate}=await import("./espn");
      const cacheKey=`espn:v2:date:${date}`;
      const db=(env as unknown as {DB?:D1Database}).DB;
      if(db){
        await ensureCacheTable(db);
        const row=await db.prepare("SELECT payload,saved_at AS savedAt FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{payload:string;savedAt:number}>();
        if(row?.savedAt&&Date.now()-row.savedAt<ttl*1000){
          try{return JSON.parse(row.payload) as LiveMatch[]}catch{/* refetch */}
        }
      }
      if(!allowProviderRequest)return [];
      const fresh=await espnMatchesForDate(date);
      if(fresh.length&&db){
        await db.prepare("INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0")
          .bind(cacheKey,JSON.stringify(fresh),Date.now()).run();
      }
      return fresh;
    }catch{return []}
  })();

  // Armenia, from the free source, because the paid one is being cancelled.
  //
  // TheSportsDB gives the fixtures and the finished results; its livescore
  // is the one thing behind its paywall. So an Armenian match reads as
  // scheduled while it is being played and appears with its score when it
  // ends. That is the whole cost of the subscription going, and it is worth
  // saying plainly rather than discovering on a Saturday evening.
  //
  // It rate-limits Cloudflare's addresses hard - two calls in a minute from
  // this Worker drew a 429 - so it goes through api_cache on the same
  // window as everything else and is never asked per page view.
  const armenian=await (async()=>{
    try{
      const {armenianMatchesForDate}=await import("./espn");
      const cacheKey=`sportsdb:v2:armenia:${date}`;
      const db=(env as unknown as {DB?:D1Database}).DB;
      if(db){
        await ensureCacheTable(db);
        const row=await db.prepare("SELECT payload,saved_at AS savedAt FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{payload:string;savedAt:number}>();
        if(row?.savedAt&&Date.now()-row.savedAt<ttl*1000){
          try{return JSON.parse(row.payload) as LiveMatch[]}catch{/* refetch */}
        }
      }
      if(!allowProviderRequest)return [];
      const fresh=await armenianMatchesForDate(date);
      if(db&&fresh.length){
        await db.prepare("INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0")
          .bind(cacheKey,JSON.stringify(fresh),Date.now()).run();
      }
      return fresh;
    }catch{return []}
  })();

  // The Armenian minute, from API-Football's free plan.
  //
  // Nothing here costs money. The subscription is being cancelled and this
  // runs on the free tier, which is not unlimited but is free: a hundred
  // requests a day. That allowance is the whole reason this is written the
  // way it is.
  //
  // TheSportsDB gives the fixtures and the finished scores for nothing but
  // has no live feed, so a match in progress would sit at its kick-off time
  // with no score. Asking API-Football every eight minutes around the clock
  // would spend a hundred and eighty requests a day - more than the free
  // plan allows - and most of them on days with no Armenian football at
  // all. That is what makes a subscription look necessary when it is not.
  //
  // So the free source decides when to ask: ten minutes before kick-off to
  // two and a half hours after, one call every five minutes, one league. A
  // match costs about two dozen requests and a quiet day costs none, which
  // fits inside a hundred with room to spare.
  const withLive=await (async()=>{
    if(!allowProviderRequest)return armenian;
    const {env:runtimeEnv}=await import("cloudflare:workers");
    const key=(runtimeEnv as unknown as Record<string,string|undefined>).API_FOOTBALL_KEY;
    if(!key||!armenian.length)return armenian;
    try{
      const {armenianMatchWindow}=await import("./espn");
      if(!(await armenianMatchWindow(date)))return armenian;
      const db=(env as unknown as {DB?:D1Database}).DB;
      const cacheKey="apifootball:armenia:live";
      let payload:{response?:ArmenianLiveFixture[]}|null=null;
      if(db){
        await ensureCacheTable(db);
        const row=await db.prepare("SELECT payload,saved_at AS savedAt FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{payload:string;savedAt:number}>();
        if(row?.savedAt&&Date.now()-row.savedAt<5*60_000){
          try{payload=JSON.parse(row.payload)}catch{/* refetch */}
        }
      }
      if(!payload){
        const res=await fetch("https://v3.football.api-sports.io/fixtures?live=all",{headers:{"x-apisports-key":key,Accept:"application/json"}});
        if(!res.ok)return armenian;
        payload=await res.json() as {response?:ArmenianLiveFixture[]};
        if(db){
          await db.prepare("INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0")
            .bind(cacheKey,JSON.stringify(payload),Date.now()).run();
        }
      }
      const live=(payload.response??[]).filter(fx=>[342,709].includes(fx.league.id));
      if(!live.length)return armenian;
      // Matched on the home club's name rather than on an id: the two
      // providers number clubs differently and neither number means
      // anything to the other.
      const normalise=(name:string)=>name.toLowerCase().replace(/[^a-z]/g,"");
      return armenian.map(m=>{
        const fx=live.find(f=>normalise(f.teams.home.name)===normalise(m.home)||normalise(f.teams.home.name).includes(normalise(m.home).slice(0,6)));
        if(!fx)return m;
        const minute=fx.fixture.status.elapsed;
        return{...m,
          status:fx.fixture.status.short==="HT"?"Ընդմիջում":minute?`${minute}′`:"LIVE",
          homeScore:fx.goals.home,
          awayScore:fx.goals.away,
          isLive:true};
      });
    }catch{return armenian}
  })();

  const matches=[...withLive,...espnMatches];
  if(!matches.length)return{matches:[],demo:false,unavailable:true,limited:true,updatedAt};
  return{matches,demo:false,unavailable:false,limited:false,updatedAt};
}
