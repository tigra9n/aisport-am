import Link from "next/link";
import { Suspense } from "react";
import { MatchModal } from "../../components/match-modal";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";
import { LiveAutoRefresh } from "../../components/live-auto-refresh";
import { AdSpaces } from "../../components/ad-spaces";
import { getLiveMatches } from "../../lib/live-football-server";

// Sites redeploy trigger: 2026-08-23
export const dynamic = "force-dynamic";
const visibleOffsets = Array.from({ length: 15 }, (_, index) => index - 7);
const weekdays = ["Կիր", "Երկ", "Երք", "Չրք", "Հնգ", "Ուրբ", "Շբթ"];
const months = ["հնվ", "փտր", "մրտ", "ապր", "մյս", "հնս", "հլս", "օգս", "սեպ", "հոկ", "նոյ", "դեկ"];
function dateAtOffset(dayOffset:number){const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Yerevan",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));return new Date(Date.UTC(Number(v.year),Number(v.month)-1,Number(v.day)+dayOffset)).toISOString().slice(0,10)}
function parseDate(date:string){return new Date(`${date}T12:00:00Z`)}
function shortDate(date:string){const d=parseDate(date);return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`}
function weekday(date:string){return weekdays[parseDate(date).getUTCDay()]}
function relativeLabel(o:number){if(o===-1)return "Երեկ";if(o===0)return "Այսօր";if(o===1)return "Վաղը";return weekday(dateAtOffset(o))}
function dateHref(o:number,d:string){return o===0?"/live":`/live?date=${d}`}

export default async function LivePage({searchParams}:{searchParams:Promise<{date?:string;day?:string}>}){
 const {date:requestedDate,day:legacyDay}=await searchParams; const dates=visibleOffsets.map(offset=>({offset,date:dateAtOffset(offset)}));
 const legacyOffset=legacyDay==="yesterday"?-1:legacyDay==="tomorrow"?1:0; const selected=dates.find(i=>i.date===requestedDate)??dates.find(i=>i.offset===legacyOffset)??dates[7];
 const selectedIndex=dates.findIndex(i=>i.date===selected.date); const previous=dates[selectedIndex-1],next=dates[selectedIndex+1]; const live=await getLiveMatches(selected.offset); const competitions=Array.from(new Set(live.matches.map(m=>m.competition)));
 return <main><LiveAutoRefresh/><SiteHeader/><AdSpaces/><div className="site-shell inner-page">
 <span className="page-kicker">Խաղային կենտրոն</span><h1 className="page-title">Live արդյունքներ</h1><p className="page-intro">Live հաշիվներ և Match Center մեկ տեղից՝ գոլեր, ասիստ, քարտեր, կազմեր և վիճակագրություն։</p>
 <div className="live-date-picker">{previous?<Link prefetch={false} className="date-arrow" href={dateHref(previous.offset,previous.date)}>‹</Link>:<span className="date-arrow disabled">‹</span>}<details className="live-calendar"><summary><span className="calendar-icon">▦</span><strong>{relativeLabel(selected.offset)} · {shortDate(selected.date)}</strong><small>{weekday(selected.date)}</small></summary><div className="live-calendar-panel">{dates.map(i=><Link prefetch={false} className={i.date===selected.date?"active":""} href={dateHref(i.offset,i.date)} key={i.date}><span>{relativeLabel(i.offset)}</span><strong>{shortDate(i.date)}</strong><small>{weekday(i.date)}</small></Link>)}</div></details>{next?<Link prefetch={false} className="date-arrow" href={dateHref(next.offset,next.date)}>›</Link>:<span className="date-arrow disabled">›</span>}</div>
 <div className="live-page-grid"><section className="matchday-card"><div className="matchday-head"><span>{relativeLabel(selected.offset)} · {shortDate(selected.date)}</span><small className={live.unavailable?"data-source demo":"data-source real"}>{live.unavailable?"Անհասանելի է":"Live"}</small></div>
 {live.matches.length?competitions.map(c=><section className="match-competition-group" key={c}><h2>{c}</h2>{live.matches.filter(m=>m.competition===c).map(m=><Link href={`/live?date=${selected.date}&match=${m.id}`} scroll={false} className="match-row match-row-link" key={m.id}><span className={m.isLive?"match-live-status live-beacon-status":""}>{m.status}</span><strong className="team-with-logo">{m.homeLogo&&<img src={m.homeLogo} alt="" className="team-logo" loading="lazy" />}{m.home}</strong><b className="score-big">{m.homeScore??"–"} : {m.awayScore??"–"}</b><strong className="team-with-logo">{m.awayLogo&&<img src={m.awayLogo} alt="" className="team-logo" loading="lazy" />}{m.away}</strong></Link>)}</section>):<div className="no-matches">{live.unavailable?"Տվյալները հասանելի չեն, փորձիր մի փոքր ուշ։":`${shortDate(selected.date)}-ին ընտրված մրցաշարերում հանդիպումներ չկան։`}</div>}</section><aside className="live-note"><h3>Ամեն ինչ մեկ տեղից</h3><p>Հաշիվ, live կարգավիճակ, գոլեր, կազմեր և վիճակագրություն՝ մեկ միասնական աղբյուրից։</p></aside></div>
 </div><AdSpaces bottom/><SiteFooter/><Suspense fallback={null}><MatchModal/></Suspense></main>;
}