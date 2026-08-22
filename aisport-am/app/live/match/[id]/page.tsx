import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "../../../../components/site-footer";
import { SiteHeader } from "../../../../components/site-header";
import { getLiveMatchDetails } from "../../../../lib/live-football-server";

export const dynamic = "force-dynamic";

function eventIcon(label: string) {
  const value = label.toLowerCase();
  if (value.includes("գոլ") || value.includes("11 մետրանոց")) return "⚽";
  if (value.includes("կարմիր")) return "🟥";
  if (value.includes("դեղին")) return "🟨";
  if (value.includes("փոխարին")) return "🔄";
  if (value.includes("var")) return "📺";
  return "•";
}

export default async function MatchDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const details = await getLiveMatchDetails(id);
  if (!details) notFound();
  const { match } = details;
  const hasVenue = details.venue !== "Տվյալ չկա" && details.venue !== "—";
  const hasReferee = details.referee !== "Տվյալ չկա" && details.referee !== "—";

  return <main><SiteHeader /><div className="site-shell inner-page match-details-page">
    <Link className="back-live-link" href="/live">← Բոլոր խաղերը</Link>
    <span className="page-kicker">{match.competition}</span>
    <h1 className="match-details-title"><span>{match.home}</span><b>{match.homeScore ?? "–"} : {match.awayScore ?? "–"}</b><span>{match.away}</span></h1>
    <div className="match-facts"><span>{match.isLive ? `🔴 ${match.status}` : match.status}</span>{hasVenue && <span>🏟 Մարզադաշտ՝ {details.venue}</span>}{hasReferee && <span>👤 Մրցավար՝ {details.referee}</span>}</div>

    <section className="match-stat-grid">{details.statistics.map((team) => <article key={team.team}><h2>{team.team}</h2><dl>
      <div><dt>xG</dt><dd>{team.xg}</dd></div>
      <div><dt>Գնդակի տիրապետում</dt><dd>{team.possession}</dd></div>
      <div><dt>Հարվածներ դարպասին</dt><dd>{team.shotsOnGoal}</dd></div>
      <div><dt>Ընդհանուր հարվածներ</dt><dd>{team.totalShots}</dd></div>
    </dl></article>)}</section>

    <div className="match-detail-columns">
      <section className="event-timeline"><h2>Խաղի իրադարձությունները</h2><p className="detail-empty">Գոլեր, ասիստներ, քարտեր, պենալտիներ, VAR և փոխարինումներ՝ ըստ API-ի հասանելի տվյալների։</p>
        {details.events.length ? details.events.map((event, index) => <article key={`${event.minute}-${event.player}-${index}`}><b>{event.minute}</b><div><strong>{eventIcon(event.label)} {event.label}</strong><span>{event.player}{event.assist !== "—" ? ` · ասիստ՝ ${event.assist}` : ""}</span><small>{event.team}</small></div></article>) : null}
      </section>
      {details.lineups.length ? <section className="lineups-panel"><h2>Կազմեր</h2>{details.lineups.map((lineup) => <details key={lineup.team}><summary><strong>{lineup.team}</strong>{lineup.formation !== "—" && <span>{lineup.formation}</span>}</summary>{lineup.starters.length ? <><h3>Մեկնարկային կազմ</h3><ol>{lineup.starters.map((player) => <li key={player}>{player}</li>)}</ol></> : null}{lineup.substitutes.length ? <><h3>Պահեստայիններ</h3><ul>{lineup.substitutes.map((player) => <li key={player}>{player}</li>)}</ul></> : null}</details>)}</section> : null}
    </div>
  </div><SiteFooter /></main>;
}
