"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { LiveMatchDetail } from "../lib/live-football-server";

const available = (value: string) => Boolean(value && value !== "—" && value !== "Տվյալ չկա");

function eventIcon(label: string) {
  const value = label.toLowerCase();
  if (value.includes("գոլ") || value.includes("11 մետրանոց")) return "⚽";
  if (value.includes("կարմիր")) return "🟥";
  if (value.includes("դեղին")) return "🟨";
  if (value.includes("փոխարին")) return "🔄";
  if (value.includes("var")) return "📺";
  return "•";
}

export function MatchModal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const matchId = searchParams.get("match");
  const [details, setDetails] = useState<LiveMatchDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"events" | "stats">("events");

  useEffect(() => {
    if (!matchId) {
      setDetails(null);
      return;
    }
    setLoading(true);
    setTab("events");
    fetch(`/api/live/match/${encodeURIComponent(matchId)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: LiveMatchDetail | null) => setDetails(data))
      .finally(() => setLoading(false));
  }, [matchId]);

  if (!matchId) return null;

  const close = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("match");
    const query = params.toString();
    router.push(query ? `?${query}` : window.location.pathname, { scroll: false });
  };

  return (
    <div className="match-modal-overlay" onClick={close}>
      <div className="match-modal" onClick={(event) => event.stopPropagation()}>
        <button className="match-modal-close" onClick={close} aria-label="Փակել">✕</button>
        {loading && <div className="match-modal-loading">Բեռնվում է…</div>}
        {!loading && !details && <div className="match-modal-loading">Տվյալները հասանելի չեն այս խաղի համար։</div>}
        {!loading && details && (
          <>
            <span className="page-kicker">{details.match.competition}</span>
            <h2 className="match-details-title match-modal-title">
              <span>{details.match.home}</span>
              <b>{details.match.homeScore ?? "–"} : {details.match.awayScore ?? "–"}</b>
              <span>{details.match.away}</span>
            </h2>
            <div className="match-facts">
              <span>{details.match.isLive ? `🔴 ${details.match.status}` : details.match.status}</span>
              {available(details.venue) && <span>🏟 Մարզադաշտ՝ {details.venue}</span>}
              {available(details.referee) && <span>👤 Մրցավար՝ {details.referee}</span>}
            </div>

            <div className="match-modal-tabs">
              <button className={tab === "events" ? "active" : ""} onClick={() => setTab("events")}>
                Իրադարձություններ և կազմեր
              </button>
              <button className={tab === "stats" ? "active" : ""} onClick={() => setTab("stats")}>
                Վիճակագրություն
              </button>
            </div>

            {tab === "events" && (
              <div className="match-detail-columns match-modal-scroll">
                {details.events.length > 0 && (
                  <section className="event-timeline">
                    <h2>Խաղի իրադարձությունները</h2>
                    {details.events.map((event, index) => (
                      <article key={`${event.minute}-${event.player}-${index}`}>
                        <b>{event.minute}</b>
                        <div>
                          <strong>{eventIcon(event.label)} {event.label}</strong>
                          {available(event.player) && (
                            <span>{event.player}{available(event.assist) ? ` · ասիստ՝ ${event.assist}` : ""}</span>
                          )}
                          {available(event.team) && <small>{event.team}</small>}
                        </div>
                      </article>
                    ))}
                  </section>
                )}
                {details.lineups.length > 0 && (
                  <section className="lineups-panel">
                    <h2>Կազմեր</h2>
                    {details.lineups.map((lineup) => (
                      <details key={lineup.team}>
                        <summary>
                          <strong>{lineup.team}</strong>
                          {available(lineup.formation) && <span>{lineup.formation}</span>}
                        </summary>
                        {lineup.starters.length > 0 && (
                          <>
                            <h3>Մեկնարկային կազմ</h3>
                            <ol>{lineup.starters.map((player, index) => <li key={`${player}-${index}`}>{player}</li>)}</ol>
                          </>
                        )}
                        {lineup.substitutes.length > 0 && (
                          <>
                            <h3>Պահեստայիններ</h3>
                            <ul>{lineup.substitutes.map((player, index) => <li key={`${player}-${index}`}>{player}</li>)}</ul>
                          </>
                        )}
                      </details>
                    ))}
                  </section>
                )}
                {details.events.length === 0 && details.lineups.length === 0 && (
                  <p className="detail-empty">Իրադարձությունների և կազմերի տվյալներ դեռ հասանելի չեն։</p>
                )}
              </div>
            )}

            {tab === "stats" && (
              <div className="match-modal-scroll">
                {details.statistics.length > 0 ? (
                  <section className="match-stat-grid">
                    {details.statistics.map((team) => {
                      const items = [
                        { label: "xG", value: team.xg },
                        { label: "Գնդակի տիրապետում", value: team.possession },
                        { label: "Հարվածներ դարպասին", value: team.shotsOnGoal },
                        { label: "Ընդհանուր հարվածներ", value: team.totalShots },
                      ].filter((item) => available(item.value));
                      if (!items.length) return null;
                      return (
                        <article key={team.team}>
                          <h2>{team.team}</h2>
                          <dl>{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
                        </article>
                      );
                    })}
                  </section>
                ) : (
                  <p className="detail-empty">Վիճակագրական տվյալներ դեռ հասանելի չեն։</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
