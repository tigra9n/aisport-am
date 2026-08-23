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

function PitchPlayer({ player, card }: { player: LineupPlayer; card?: "yellow" | "red" }) {
  return (
    <div className="pitch-player">
      <span className="pitch-player-dot">
        {player.number ?? "•"}
        {card && <i className={`pitch-card ${card}`} />}
      </span>
      <span className="pitch-player-name">{player.name}</span>
    </div>
  );
}

type CardMap = Map<string, "yellow" | "red">;
type SubPair = { out: string; in: string; minute: string; side: "home" | "away" };

function buildCardMap(events: LiveMatchDetail["events"]): CardMap {
  const map: CardMap = new Map();
  for (const event of events) {
    if (event.label === "Կարմիր քարտ") map.set(event.player, "red");
    else if (event.label === "Դեղին քարտ" && !map.has(event.player)) map.set(event.player, "yellow");
  }
  return map;
}

function buildSubPairs(events: LiveMatchDetail["events"], sideOf: (team: string) => "home" | "away" | null): SubPair[] {
  return events
    .filter((event) => event.label === "Փոխարինում")
    .map((event) => ({ out: event.assist, in: event.player, minute: event.minute, side: sideOf(event.team) ?? "home" }))
    .filter((pair) => pair.out !== "—" && pair.in !== "—");
}

function SharedPitch({ details, cardMap }: { details: LiveMatchDetail; cardMap: CardMap }) {
  const [home, away] = details.lineups;
  const homeRows = formationRows(home.formation);
  const awayRows = formationRows(away.formation);
  const homeChunks = (homeRows.length ? chunkByRows(home.starters, homeRows) : [home.starters]).slice().reverse();
  const awayChunks = awayRows.length ? chunkByRows(away.starters, awayRows) : [away.starters];

  return (
    <div className="pitch-wrap">
      <div className="pitch-team-label">
        <strong>{away.team}</strong>
        {available(away.formation) && <span>{away.formation}</span>}
      </div>
      <div className="pitch shared">
        {awayChunks.map((row, rowIndex) => (
          <div className="pitch-row" key={`away-${rowIndex}`}>
            {row.map((player, playerIndex) => (
              <PitchPlayer key={`${player.name}-${playerIndex}`} player={player} card={cardMap.get(player.name)} />
            ))}
          </div>
        ))}
        <div className="pitch-halfway" />
        {homeChunks.map((row, rowIndex) => (
          <div className="pitch-row" key={`home-${rowIndex}`}>
            {row.map((player, playerIndex) => (
              <PitchPlayer key={`${player.name}-${playerIndex}`} player={player} card={cardMap.get(player.name)} />
            ))}
          </div>
        ))}
      </div>
      <div className="pitch-team-label">
        <strong>{home.team}</strong>
        {available(home.formation) && <span>{home.formation}</span>}
      </div>
    </div>
  );
}

function SubstitutionsList({ pairs }: { pairs: SubPair[] }) {
  if (!pairs.length) return null;
  return (
    <div className="subs-list">
      <h3>Փոխարինումներ</h3>
      <div className="sub-pairs">
        {pairs.map((pair, index) => (
          <div className={`sub-pair-row ${pair.side === "home" ? "is-home" : "is-away"}`} key={`${pair.out}-${pair.in}-${index}`}>
            {pair.side === "home" && (
              <span className="sub-pair-names"><b className="sub-out">↓ {pair.out}</b><b className="sub-in">↑ {pair.in}</b></span>
            )}
            <span className="sub-pair-minute">{pair.minute}</span>
            {pair.side !== "home" && (
              <span className="sub-pair-names right"><b className="sub-out">↓ {pair.out}</b><b className="sub-in">↑ {pair.in}</b></span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MatchModal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const matchId = searchParams.get("match");
  const [details, setDetails] = useState<LiveMatchDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"events" | "lineups" | "stats" | "h2h" | "prediction" | "standings" | "topscorers">("events");

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
              <span className="team-with-logo title-team">{details.match.homeLogo && <img src={details.match.homeLogo} alt="" className="team-logo-lg" loading="lazy" />}{details.match.home}</span>
              <b>{details.match.homeScore ?? "–"} : {details.match.awayScore ?? "–"}</b>
              <span className="team-with-logo title-team">{details.match.awayLogo && <img src={details.match.awayLogo} alt="" className="team-logo-lg" loading="lazy" />}{details.match.away}</span>
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
              {details.h2h.length > 0 && <button className={tab === "h2h" ? "active" : ""} onClick={() => setTab("h2h")}>H2H</button>}
              {details.prediction && <button className={tab === "prediction" ? "active" : ""} onClick={() => setTab("prediction")}>Կանխատեսում</button>}
              {details.standings && details.standings.length > 0 && <button className={tab === "standings" ? "active" : ""} onClick={() => setTab("standings")}>Աղյուսակ</button>}
              {details.topScorers && details.topScorers.length > 0 && <button className={tab === "topscorers" ? "active" : ""} onClick={() => setTab("topscorers")}>Ռմբարկուներ</button>}
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
                {details.lineups.length === 2 ? (
                  <>
                    <SharedPitch details={details} cardMap={buildCardMap(details.events)} />
                    <SubstitutionsList pairs={buildSubPairs(details.events, sideOf)} />
                    <div className="subs-teams">
                      {details.lineups.map((lineup) => (
                        lineup.substitutes.length > 0 && (
                          <div className="subs-list" key={lineup.team}>
                            <h3>{lineup.team} · Պահեստայիններ</h3>
                            <div className="subs-grid">
                              {lineup.substitutes.map((player, index) => (
                                <span className="subs-chip" key={`${player.name}-${index}`}>
                                  <b>{player.number ?? "•"}</b>{player.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )
                      ))}
                    </div>
                  </>
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

            {tab === "h2h" && (
              <div className="match-modal-scroll">
                <div className="h2h-list">
                  {details.h2h.map((meeting, index) => (
                    <div className="h2h-row" key={`${meeting.date}-${index}`}>
                      <span className="h2h-date">{meeting.date}</span>
                      <span className="h2h-teams">
                        <b className={meeting.home === homeName ? "h2h-highlight" : ""}>{meeting.home}</b>
                        <em>{meeting.homeScore ?? "–"} : {meeting.awayScore ?? "–"}</em>
                        <b className={meeting.away === awayName ? "h2h-highlight" : ""}>{meeting.away}</b>
                      </span>
                      <span className="h2h-competition">{meeting.competition}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "prediction" && details.prediction && (
              <div className="match-modal-scroll">
                <div className="prediction-panel">
                  <div className="prediction-bar">
                    <div className="prediction-bar-fill home" style={{ width: `${parseInt(details.prediction.homePct, 10) || 0}%` }} />
                    <div className="prediction-bar-fill draw" style={{ width: `${parseInt(details.prediction.drawPct, 10) || 0}%` }} />
                    <div className="prediction-bar-fill away" style={{ width: `${parseInt(details.prediction.awayPct, 10) || 0}%` }} />
                  </div>
                  <div className="prediction-legend">
                    <span><b>{details.prediction.homePct}</b>{homeName}</span>
                    <span><b>{details.prediction.drawPct}</b>Ոչ-ոքի</span>
                    <span><b>{details.prediction.awayPct}</b>{awayName}</span>
                  </div>
                  {available(details.prediction.winnerName ?? "") && (
                    <p className="prediction-note">Հավանական հաղթող՝ <b>{details.prediction.winnerName}</b></p>
                  )}
                  {available(details.prediction.advice ?? "") && <p className="prediction-note">{details.prediction.advice}</p>}
                </div>
              </div>
            )}

            {tab === "standings" && details.standings && (
              <div className="match-modal-scroll">
                <table className="standings-table popup-standings-table">
                  <thead><tr><th>#</th><th>Թիմ</th><th>Խ</th><th>ԳՏ</th><th>Մ</th></tr></thead>
                  <tbody>
                    {details.standings.map((row) => (
                      <tr key={row.team} className={`${row.team === homeName || row.team === awayName ? "popup-standings-highlight" : ""} ${row.position <= 4 ? "zone-ucl" : row.position === 5 ? "zone-europa" : row.position > details.standings!.length - 3 ? "zone-drop" : ""}`}>
                        <td><span className="position-marker">{row.position}</span></td>
                        <td>{row.teamLogo ? <img src={row.teamLogo} alt="" className="team-badge-logo" loading="lazy" /> : <span className="team-badge">{row.team.slice(0, 1)}</span>}<strong>{row.team}</strong></td>
                        <td>{row.played}</td>
                        <td>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                        <td><b>{row.points}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === "topscorers" && details.topScorers && (
              <div className="match-modal-scroll">
                <table className="standings-table popup-standings-table">
                  <thead><tr><th>#</th><th>Խաղացող</th><th>Թիմ</th><th>Գ</th></tr></thead>
                  <tbody>
                    {details.topScorers.slice(0, 10).map((row) => (
                      <tr key={row.name}>
                        <td><span className="position-marker">{row.rank}</span></td>
                        <td><span className="player-with-photo">{row.photo && <img src={row.photo} alt="" className="player-photo" loading="lazy" />}<strong>{row.name}</strong></span></td>
                        <td><span className="team-with-logo">{row.teamLogo && <img src={row.teamLogo} alt="" className="team-logo" loading="lazy" />}{row.team}</span></td>
                        <td><b>{row.goals}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
