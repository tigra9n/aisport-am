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

async function fetchJson<T>(url:string,key:string):Promise<T|null>{
  try{
    const response=await fetch(url,{headers:{"x-apisports-key":key,Accept:"application/json"},cache:"no-store"});
    if(!response.ok)return null;
    return await response.json() as T;
  }catch{return null}
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

  const fixtureData=await fetchJson<{response?:ApiFootballFixtureFull[]}>(`https://v3.football.api-sports.io/fixtures?id=${fixtureId}`,key);
  const fx=fixtureData?.response?.[0];
  if(!fx)return null;
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

  return{
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
}
