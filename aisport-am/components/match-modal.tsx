"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { LineupPlayer, LiveMatchDetail } from "../lib/live-football-server";

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

function formationRows(formation: string): number[] {
  const parts = formation.split("-").map((n) => Number.parseInt(n, 10)).filter((n) => Number.isFinite(n) && n > 0);
  if (!parts.length) return [];
  return [1, ...parts];
}

function chunkByRows<T>(items: T[], rows: number[]): T[][] {
  const chunks: T[][] = [];
  let i = 0;
  for (const size of rows) {
    chunks.push(items.slice(i, i + size));
    i += size;
  }
  const leftover = items.slice(i);
  if (leftover.length) chunks.push(leftover);
  return chunks;
}

function PitchPlayer({ player }: { player: LineupPlayer }) {
  return (
    <div className="pitch-player">
      <span className="pitch-player-dot">{player.number ?? "•"}</span>
      <span className="pitch-player-name">{player.name}</span>
    </div>
  );
}

export function MatchModal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const matchId = searchParams.get("match");
  const [details, setDetails] = useState<LiveMatchDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"events" | "lineups" | "stats">("events");

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

  const homeName = details?.match.home ?? "";
  const awayName = details?.match.away ?? "";
  const sideOf = (team: string): "home" | "away" | null => {
    if (team === homeName) return "home";
    if (team === awayName) return "away";
    return null;
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
              <button className={tab === "events" ? "active" : ""} onClick={() => setTab("events")}>Իրադարձություններ</button>
              <button className={tab === "lineups" ? "active" : ""} onClick={() => setTab("lineups")}>Կազմեր</button>
              <button className={tab === "stats" ? "active" : ""} onClick={() => setTab("stats")}>Վիճակագրություն</button>
            </div>

            {tab === "events" && (
              <div className="match-detail-columns match-modal-scroll">
                {details.events.length > 0 ? (
                  <section className="event-timeline">
                    <div className="timeline-side-heads">
                      <strong>{homeName}</strong>
                      <span />
                      <strong>{awayName}</strong>
                    </div>
                    <div className="event-spine">
                      {details.events.map((event, index) => {
                        const side = sideOf(event.team);
                        const rowClass = side === "home" ? "is-home" : side === "away" ? "is-away" : "is-home";
                        return (
                          <div key={`${event.minute}-${event.player}-${index}`} className={`event-spine-row ${rowClass}`}>
                            {rowClass === "is-home" && (
                              <div className="event-spine-card">
                                <div className="event-spine-text">
                                  <strong>{event.label}</strong>
                                  {available(event.player) && <small>{event.player}{available(event.assist) ? ` · ասիստ՝ ${event.assist}` : ""}</small>}
                                </div>
                                <span className="event-spine-icon">{eventIcon(event.label)}</span>
                              </div>
                            )}
                            <span className="event-spine-minute">{event.minute}</span>
                            {rowClass === "is-away" && (
                              <div className="event-spine-card">
                                <span className="event-spine-icon">{eventIcon(event.label)}</span>
                                <div className="event-spine-text">
                                  <strong>{event.label}</strong>
                                  {available(event.player) && <small>{event.player}{available(event.assist) ? ` · ասիստ՝ ${event.assist}` : ""}</small>}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ) : (
                  <p className="detail-empty">Իրադարձությունների տվյալներ դեռ հասանելի չեն։</p>
                )}
              </div>
            )}

            {tab === "lineups" && (
              <div className="match-modal-scroll">
                {details.lineups.length > 0 ? (
                  <div className="lineups-panel">
                    {details.lineups.map((lineup, teamIndex) => {
                      const rows = formationRows(lineup.formation);
                      const chunks = rows.length ? chunkByRows(lineup.starters, rows) : [lineup.starters];
                      const flip = teamIndex === 1;
                      return (
                        <div className="pitch-wrap" key={lineup.team}>
                          <div className="pitch-team-label">
                            <strong>{lineup.team}</strong>
                            {available(lineup.formation) && <span>{lineup.formation}</span>}
                          </div>
                          <div className={`pitch ${flip ? "flip" : ""}`}>
                            {chunks.map((row, rowIndex) => (
                              <div className="pitch-row" key={rowIndex}>
                                {row.map((player, playerIndex) => <PitchPlayer key={`${player.name}-${playerIndex}`} player={player} />)}
                              </div>
                            ))}
                          </div>
                          {lineup.substitutes.length > 0 && (
                            <div className="subs-list">
                              <h3>Պահեստայիններ</h3>
                              <div className="subs-grid">
                                {lineup.substitutes.map((player, index) => (
                                  <span className="subs-chip" key={`${player.name}-${index}`}>
                                    <b>{player.number ?? "•"}</b>{player.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="detail-empty">Կազմերի տվյալներ դեռ հասանելի չեն։</p>
                )}
              </div>
            )}

            {tab === "stats" && (
              <div className="match-modal-scroll">
                {details.statistics.length === 2 ? (
                  <StatBars home={details.statistics[0]} away={details.statistics[1]} />
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

type TeamStats = { team: string; possession: string; shotsOnGoal: string; totalShots: string; xg: string };

function parseNumber(value: string): number {
  const match = value.match(/[\d.]+/);
  return match ? Number.parseFloat(match[0]) : 0;
}

function StatBars({ home, away }: { home: TeamStats; away: TeamStats }) {
  const rows: { label: string; home: string; away: string }[] = [
    { label: "Գնդակի տիրապետում", home: home.possession, away: away.possession },
    { label: "Հարվածներ դարպասին", home: home.shotsOnGoal, away: away.shotsOnGoal },
    { label: "Ընդհանուր հարվածներ", home: home.totalShots, away: away.totalShots },
    { label: "xG", home: home.xg, away: away.xg },
  ].filter((row) => available(row.home) || available(row.away));

  return (
    <div className="stat-bars">
      {rows.map((row) => {
        const h = parseNumber(row.home);
        const a = parseNumber(row.away);
        const total = h + a || 1;
        const homePct = Math.round((h / total) * 100);
        const awayPct = 100 - homePct;
        return (
          <div className="stat-bar-row" key={row.label}>
            <b>{available(row.home) ? row.home : "—"}</b>
            <div className="stat-bar-track home"><div className="stat-bar-fill" style={{ width: `${homePct}%` }} /></div>
            <span>{row.label}</span>
            <div className="stat-bar-track away"><div className="stat-bar-fill" style={{ width: `${awayPct}%` }} /></div>
            <b>{available(row.away) ? row.away : "—"}</b>
          </div>
        );
      })}
    </div>
  );
}
