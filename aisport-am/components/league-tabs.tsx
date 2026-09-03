"use client";

import { sizedImage } from "../lib/image-proxy";
import Link from "next/link";
import { useState } from "react";
import { leagues, type StandingRow } from "../lib/football";
import type { TopScorer } from "../lib/topscorers-server";

type StandingsTables = Record<string, { rows: StandingRow[]; demo: boolean }>;
type TopScorerTables = Record<string, { rows: TopScorer[]; unavailable: boolean }>;

export function LeagueTabs({ tables, topScorerTables, compact = false }: { tables: StandingsTables; topScorerTables?: TopScorerTables; compact?: boolean }) {
  const [active, setActive] = useState("PL");
  const [mode, setMode] = useState<"standings" | "topscorers">("standings");
  const selected = leagues.find((league) => league.code === active) ?? leagues[0];
  const standingsData = tables[active];
  const rows = standingsData?.rows ?? [];
  const scorerRows = topScorerTables?.[active]?.rows ?? [];
  const showToggle = Boolean(topScorerTables);

  return (
    <div className={`league-widget ${compact ? "compact" : ""}`}>
      <div className="league-select-shell">
        <label htmlFor={`league-select-${compact ? "compact" : "full"}`}>Ընտրել առաջնությունը</label>
        <div className="league-select-wrap">
          <select
            id={`league-select-${compact ? "compact" : "full"}`}
            className="league-select"
            value={active}
            onChange={(event) => setActive(event.target.value)}
            aria-label="Ընտրել առաջնությունը"
          >
            {leagues.map((league) => <option key={league.code} value={league.code}>{league.country} · {league.name}</option>)}
          </select>
          <span aria-hidden="true">⌄</span>
        </div>
      </div>
      <div className="table-title">
        <div><span>{selected.country}</span><strong>{selected.name}</strong></div>
        {showToggle ? (
          <div className="mode-toggle">
            <button className={mode === "standings" ? "active" : ""} onClick={() => setMode("standings")}>Աղյուսակ</button>
            <button className={mode === "topscorers" ? "active" : ""} onClick={() => setMode("topscorers")}>Ռմբարկուներ</button>
          </div>
        ) : (
          standingsData?.demo ? <small>Դեմո տվյալներ</small> : <small className="live-data">Թարմացված</small>
        )}
      </div>

      {mode === "standings" ? (
        <div className="standings-scroll">
          <table className="standings-table">
            <thead><tr><th>#</th><th>Թիմ</th><th>Խ</th>{!compact ? <><th>Հ</th><th>Ո</th><th>Պ</th><th>ԳՏ</th></> : null}<th>Մ</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.team} className={row.position <= 4 ? "zone-ucl" : row.position === 5 ? "zone-europa" : row.position > rows.length - 3 ? "zone-drop" : ""}>
                  <td><span className="position-marker">{row.position}</span></td>
                  <td>{row.teamId ? (
                    <Link href={`/team/${row.teamId}`} className="team-cell-link">
                      {row.teamLogo ? <img src={sizedImage(row.teamLogo, 24)} alt="" className="team-badge-logo" loading="lazy" /> : <span className="team-badge">{row.team.slice(0, 1)}</span>}
                      <strong>{row.team}</strong>
                    </Link>
                  ) : (
                    <span className="team-with-logo">{row.teamLogo ? <img src={sizedImage(row.teamLogo, 24)} alt="" className="team-badge-logo" loading="lazy" /> : <span className="team-badge">{row.team.slice(0, 1)}</span>}<strong>{row.team}</strong></span>
                  )}</td>
                  <td>{row.played}</td>
                  {!compact ? <><td>{row.won}</td><td>{row.draw}</td><td>{row.lost}</td><td>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td></> : null}
                  <td><b>{row.points}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="standings-scroll">
          {scorerRows.length > 0 ? (
            <table className="standings-table topscorers-table">
              <thead><tr><th>#</th><th>Խաղացող</th>{!compact ? <th>Թիմ</th> : null}{!compact ? <th>Խ</th> : null}{!compact ? <th>Ա</th> : null}<th>Գ</th></tr></thead>
              <tbody>
                {(compact ? scorerRows.slice(0, 5) : scorerRows).map((row) => (
                  <tr key={row.name}>
                    <td><span className="position-marker">{row.rank}</span></td>
                    <td>
                      <Link href={`/player/${row.id}`} className="player-with-photo team-cell-link">
                        {row.photo && <img src={sizedImage(row.photo, 32)} alt="" className="player-photo" loading="lazy" />}
                        <strong>{row.name}{compact && <span className="player-team-hint"> ({row.team})</span>}</strong>
                      </Link>
                    </td>
                    {!compact ? <td><span className="team-with-logo">{row.teamLogo && <img src={sizedImage(row.teamLogo, 24)} alt="" className="team-logo" loading="lazy" />}{row.team}</span></td> : null}
                    {!compact ? <td>{row.appearances}</td> : null}
                    {!compact ? <td>{row.assists}</td> : null}
                    <td><b>{row.goals}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="detail-empty">Տվյալները հասանելի չեն այս պահին։</p>
          )}
        </div>
      )}

      {!compact && mode === "standings" ? <div className="zone-legend"><span className="ucl">Չեմպիոնների լիգա</span><span className="europa">Եվրոպա լիգա</span><span className="drop">Իջեցման գոտի</span></div> : null}
    </div>
  );
}
