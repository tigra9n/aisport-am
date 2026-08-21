import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "../../../../components/site-footer";
import { SiteHeader } from "../../../../components/site-header";
import { getLiveMatchDetails } from "../../../../lib/live-football-server";

export const dynamic = "force-dynamic";

export default async function MatchDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const details = await getLiveMatchDetails(id);
  if (!details) notFound();
  const { match } = details;

  return <main><SiteHeader /><div className="site-shell inner-page match-details-page"><Link className="back-live-link" href="/live">← Բոլոր խաղերը</Link><span className="page-kicker">{match.competition}</span><h1 className="match-details-title"><span>{match.home}</span><b>{match.homeScore ?? "–"} : {match.awayScore ?? "–"}</b><span>{match.away}</span></h1><div className="match-facts"><span>{match.status}</span><span>Մարզադաշտ՝ {details.venue}</span><span>Մրցավար՝ {details.referee}</span></div>
    <section className="match-stat-grid">{details.statistics.map((team) => <article key={team.team}><h2>{team.team}</h2><dl><div><dt>xG</dt><dd>{team.xg}</dd></div><div><dt>Գնդակի տիրապետում</dt><dd>{team.possession}</dd></div><div><dt>Հարվածներ դարպասին</dt><dd>{team.shotsOnGoal}</dd></div><div><dt>Ընդհանուր հարվածներ</dt><dd>{team.totalShots}</dd></div></dl></article>)}</section>
    <div className="match-detail-columns"><section className="event-timeline"><h2>Խաղի իրադարձությունները</h2>{details.events.length ? details.events.map((event, index) => <article key={`${event.minute}-${event.player}-${index}`}><b>{event.minute}</b><div><strong>{event.label}</strong><span>{event.player}{event.assist !== "—" ? ` · փոխանցում՝ ${event.assist}` : ""}</span><small>{event.team}</small></div></article>) : <p className="detail-empty">Իրադարձությունների տվյալները դեռ չեն հրապարակվել։</p>}</section><section className="lineups-panel"><h2>Կազմեր</h2>{details.lineups.length ? details.lineups.map((lineup) => <details key={lineup.team}><summary><strong>{lineup.team}</strong><span>{lineup.formation}</span></summary><h3>Մեկնարկային կազմ</h3><ol>{lineup.starters.map((player) => <li key={player}>{player}</li>)}</ol><h3>Պահեստայիններ</h3><ul>{lineup.substitutes.map((player) => <li key={player}>{player}</li>)}</ul></details>) : <p className="detail-empty">Կազմերը դեռ չեն հրապարակվել։</p>}</section></div>
  </div><SiteFooter /></main>;
}
