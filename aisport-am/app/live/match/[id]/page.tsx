import { sizedImage } from "../../../../lib/image-proxy";
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
    alternates: { canonical: `https://aifootball.am/live/match/${id}` },
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
 // Four rows, of which one was expected goals, was what the paid provider
 // sent and what this page was shaped around. ESPN sends twenty-eight and
 // no expected goals at all, so the page follows the provider rather than
 // the other way round: every row it has, in the order a reader looks for
 // them, and no empty xG line printed beside real numbers.
 const statRows=details.statRows?.length
   ?details.statRows.filter(row=>available(row.home)||available(row.away))
   :details.statistics.length===2?[
   {label:"Գնդակի տիրապետում",home:details.statistics[0].possession,away:details.statistics[1].possession},
   {label:"Հարվածներ դարպասին",home:details.statistics[0].shotsOnGoal,away:details.statistics[1].shotsOnGoal},
   {label:"Ընդհանուր հարվածներ",home:details.statistics[0].totalShots,away:details.statistics[1].totalShots},
   {label:"xG",home:details.statistics[0].xg,away:details.statistics[1].xg},
 ].filter(row=>available(row.home)||available(row.away)):[];
 // A possession or accuracy row is a percentage and its two halves make a
 // hundred; a count of shots does not. Drawing both as a split bar makes
 // "12 shots against 4" look like a share of something, so only the
 // percentages get bars and the counts are printed as numbers.
 const isShare=(label:string)=>/տիրապետում|ճշգրտություն|տոկոս/i.test(label);
 return <main><SiteHeader/><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(jsonLd)}}/><div className="site-shell inner-page match-details-page"><Link className="back-live-link" href="/live">← Բոլոր խաղերը</Link><span className="page-kicker">{match.competition}</span><h1 className="match-details-title"><span className="team-with-logo title-team">{match.homeLogo&&<img src={sizedImage(match.homeLogo, 48)} alt="" className="team-logo-lg" loading="lazy"/>}{match.home}</span><b>{match.homeScore??"–"} : {match.awayScore??"–"}</b><span className="team-with-logo title-team">{match.awayLogo&&<img src={sizedImage(match.awayLogo, 48)} alt="" className="team-logo-lg" loading="lazy"/>}{match.away}</span></h1><div className="match-facts"><span>{match.isLive?`🔴 ${match.status}`:match.status}</span>{available(details.venue)&&<span>🏟 Մարզադաշտ՝ {details.venue}</span>}{available(details.referee)&&<span>👤 Մրցավար՝ {details.referee}</span>}</div>
 {statRows.length>0&&<section className="stat-bars">{statRows.map(row=>{const h=parseNumber(row.home);const a=parseNumber(row.away);const total=h+a||1;const homePct=Math.round((h/total)*100);const awayPct=100-homePct;const share=isShare(row.label);return <div className={`stat-bar-row${share?"":" stat-bar-row-plain"}`} key={row.label}><b>{available(row.home)?row.home:"—"}</b><div className="stat-bar-track home">{share&&<div className="stat-bar-fill" style={{width:`${homePct}%`}}/>}</div><span>{row.label}</span><div className="stat-bar-track away">{share&&<div className="stat-bar-fill" style={{width:`${awayPct}%`}}/>}</div><b>{available(row.away)?row.away:"—"}</b></div>})}</section>}
 {details.events.length>0&&<section className="event-timeline" style={{marginTop:18}}><div className="timeline-side-heads"><strong>{match.home}</strong><span/><strong>{match.away}</strong></div><div className="event-spine">{details.events.map((event,index)=>{const side=event.team===match.home?"is-home":"is-away";return <div key={`${event.minute}-${event.player}-${index}`} className={`event-spine-row ${side}`}>{side==="is-home"&&<div className="event-spine-card"><div className="event-spine-text"><strong>{event.label}</strong>{available(event.player)&&<small>{event.player}{available(event.assist)?` · ասիստ՝ ${event.assist}`:""}</small>}</div><span className="event-spine-icon">{eventIcon(event.label)}</span></div>}<span className="event-spine-minute">{event.minute}</span>{side==="is-away"&&<div className="event-spine-card"><span className="event-spine-icon">{eventIcon(event.label)}</span><div className="event-spine-text"><strong>{event.label}</strong>{available(event.player)&&<small>{event.player}{available(event.assist)?` · ասիստ՝ ${event.assist}`:""}</small>}</div></div>}</div>})}</div></section>}
 {details.lineups.length>0&&<div className="lineups-panel" style={{marginTop:18}}>{details.lineups.map(lineup=>{const did=(name:string)=>details.playerLines?.[name]??[];return <div className="pitch-wrap" key={lineup.team}><div className="pitch-team-label"><strong>{lineup.team}</strong>{available(lineup.formation)&&<span>{lineup.formation}</span>}</div><div className="subs-list"><h3>Կազմ</h3><div className="subs-grid">{lineup.starters.map((player,index)=><span className="subs-chip" key={`s-${player.name}-${index}`}><b>{player.number??"•"}</b>{player.name}{did(player.name).length>0&&<em className="player-did">{did(player.name).map(d=>d.value>1?`${d.label} ×${d.value}`:d.label).join(" · ")}</em>}</span>)}</div>{lineup.substitutes.length>0&&<><h3 style={{marginTop:12}}>Պահեստայիններ</h3><div className="subs-grid">{lineup.substitutes.map((player,index)=><span className="subs-chip" key={`b-${player.name}-${index}`}><b>{player.number??"•"}</b>{player.name}{did(player.name).length>0&&<em className="player-did">{did(player.name).map(d=>d.value>1?`${d.label} ×${d.value}`:d.label).join(" · ")}</em>}</span>)}</div></>}</div></div>})}</div>}
 {/* Previous meetings, which the page has always had room for and only now
     has data for on every match rather than the ones the paid provider
     happened to cover. */}
 {details.h2h.length>0&&<section className="h2h-panel" style={{marginTop:18}}><h2>Նախորդ հանդիպումները</h2><ul className="h2h-list">{details.h2h.slice(0,6).map((game,index)=><li key={`h-${index}`}><span className="h2h-date">{game.date}</span><span className="h2h-teams">{game.home} <b>{game.homeScore??"–"}:{game.awayScore??"–"}</b> {game.away}</span></li>)}</ul></section>}
 {/* Minute by minute. This is the provider's writing rather than its
     facts - a score belongs to nobody, a sentence belongs to whoever wrote
     it - so it is credited in the heading, not silently absorbed. */}
 {(details.commentary?.length??0)>0&&<section className="commentary-panel" style={{marginTop:18}}><h2>Խաղի ընթացքը{details.commentarySource&&<small className="commentary-source">աղբյուր՝ {details.commentarySource}</small>}</h2><ol className="commentary-list">{details.commentary!.slice().reverse().slice(0,60).map((line,index)=><li key={`c-${index}`}><b>{line.minute}</b><span>{line.text}</span></li>)}</ol></section>}
 </div><SiteFooter/></main>;
}
