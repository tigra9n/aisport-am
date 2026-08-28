import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "../../../../components/site-footer";
import { SiteHeader } from "../../../../components/site-header";
import { getLiveMatchDetailsV2 } from "../../../../lib/live-match-details-v2";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const details = await getLiveMatchDetailsV2(id);
  if (!details) return {};
  const { match } = details;
  const title = `${match.home} ${match.homeScore ?? ""} - ${match.awayScore ?? ""} ${match.away}`.replace(/\s+/g, " ").trim();
  const description = `${match.home} - ${match.away}. ${match.competition}։ ${match.status}։`;
  return {
    title: `${title} | AIFootball.am`,
    description,
    alternates: { canonical: `https://aisport.am/live/match/${id}` },
  };
}
const available=(value:string)=>Boolean(value&&value!=="—"&&value!=="Տվյալ չկա");
function eventIcon(label:string){const value=label.toLowerCase();if(value.includes("գոլ")||value.includes("11 մետրանոց"))return"⚽";if(value.includes("կարմիր"))return"🟥";if(value.includes("դեղին"))return"🟨";if(value.includes("փոխարին"))return"🔄";if(value.includes("var"))return"📺";return"•"}
function parseNumber(value:string){const m=value.match(/[\d.]+/);return m?Number.parseFloat(m[0]):0}

export default async function MatchDetailsPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;const details=await getLiveMatchDetailsV2(id);if(!details)notFound();const {match}=details;
 const jsonLd={
   "@context":"https://schema.org",
   "@type":"SportsEvent",
   name:`${match.home} vs ${match.away}`,
   sport:"Football",
   competitor:[{"@type":"SportsTeam",name:match.home},{"@type":"SportsTeam",name:match.away}],
   eventStatus:"https://schema.org/EventScheduled",
   location:available(details.venue)?{"@type":"Place",name:details.venue}:undefined,
   superEvent:{"@type":"SportsOrganization",name:match.competition},
   ...(match.homeScore!=null&&match.awayScore!=null?{description:`${match.home} ${match.homeScore} - ${match.awayScore} ${match.away}`}:{}),
 };
 const statRows=details.statistics.length===2?[
   {label:"Գնդակի տիրապետում",home:details.statistics[0].possession,away:details.statistics[1].possession},
   {label:"Հարվածներ դարպասին",home:details.statistics[0].shotsOnGoal,away:details.statistics[1].shotsOnGoal},
   {label:"Ընդհանուր հարվածներ",home:details.statistics[0].totalShots,away:details.statistics[1].totalShots},
   {label:"xG",home:details.statistics[0].xg,away:details.statistics[1].xg},
 ].filter(row=>available(row.home)||available(row.away)):[];
 return <main><SiteHeader/><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(jsonLd)}}/><div className="site-shell inner-page match-details-page"><Link className="back-live-link" href="/live">← Բոլոր խաղերը</Link><span className="page-kicker">{match.competition}</span><h1 className="match-details-title"><span className="team-with-logo title-team">{match.homeLogo&&<img src={match.homeLogo} alt="" className="team-logo-lg" loading="lazy"/>}{match.home}</span><b>{match.homeScore??"–"} : {match.awayScore??"–"}</b><span className="team-with-logo title-team">{match.awayLogo&&<img src={match.awayLogo} alt="" className="team-logo-lg" loading="lazy"/>}{match.away}</span></h1><div className="match-facts"><span>{match.isLive?`🔴 ${match.status}`:match.status}</span>{available(details.venue)&&<span>🏟 Մարզադաշտ՝ {details.venue}</span>}{available(details.referee)&&<span>👤 Մրցավար՝ {details.referee}</span>}</div>
 {statRows.length>0&&<section className="stat-bars">{statRows.map(row=>{const h=parseNumber(row.home);const a=parseNumber(row.away);const total=h+a||1;const homePct=Math.round((h/total)*100);const awayPct=100-homePct;return <div className="stat-bar-row" key={row.label}><b>{available(row.home)?row.home:"—"}</b><div className="stat-bar-track home"><div className="stat-bar-fill" style={{width:`${homePct}%`}}/></div><span>{row.label}</span><div className="stat-bar-track away"><div className="stat-bar-fill" style={{width:`${awayPct}%`}}/></div><b>{available(row.away)?row.away:"—"}</b></div>})}</section>}
 {details.events.length>0&&<section className="event-timeline" style={{marginTop:18}}><div className="timeline-side-heads"><strong>{match.home}</strong><span/><strong>{match.away}</strong></div><div className="event-spine">{details.events.map((event,index)=>{const side=event.team===match.home?"is-home":"is-away";return <div key={`${event.minute}-${event.player}-${index}`} className={`event-spine-row ${side}`}>{side==="is-home"&&<div className="event-spine-card"><div className="event-spine-text"><strong>{event.label}</strong>{available(event.player)&&<small>{event.player}{available(event.assist)?` · ասիստ՝ ${event.assist}`:""}</small>}</div><span className="event-spine-icon">{eventIcon(event.label)}</span></div>}<span className="event-spine-minute">{event.minute}</span>{side==="is-away"&&<div className="event-spine-card"><span className="event-spine-icon">{eventIcon(event.label)}</span><div className="event-spine-text"><strong>{event.label}</strong>{available(event.player)&&<small>{event.player}{available(event.assist)?` · ասիստ՝ ${event.assist}`:""}</small>}</div></div>}</div>})}</div></section>}
 {details.lineups.length>0&&<div className="lineups-panel" style={{marginTop:18}}>{details.lineups.map(lineup=><div className="pitch-wrap" key={lineup.team}><div className="pitch-team-label"><strong>{lineup.team}</strong>{available(lineup.formation)&&<span>{lineup.formation}</span>}</div>{lineup.substitutes.length>0&&<div className="subs-list"><h3>Կազմ</h3><div className="subs-grid">{lineup.starters.map((player,index)=><span className="subs-chip" key={`s-${player.name}-${index}`}><b>{player.number??"•"}</b>{player.name}</span>)}</div><h3 style={{marginTop:12}}>Պահեստայիններ</h3><div className="subs-grid">{lineup.substitutes.map((player,index)=><span className="subs-chip" key={`b-${player.name}-${index}`}><b>{player.number??"•"}</b>{player.name}</span>)}</div></div>}</div>)}</div>}
 </div><SiteFooter/></main>;
}
