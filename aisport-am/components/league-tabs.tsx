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
  // The colours down the side of a table say "these go to the Champions
  // League, these go down" - which is a domestic league's idea and means
  // nothing in a European competition, where the whole table is already in
  // it and nobody is relegated.
  const cup = active === "CL" || active === "EL" || active === "ECL";
  const scorerRows = topScorerTables?.[active]?.rows ?? [];
  // A "Ռմբարկուներ" button that opens an empty panel is worse than no
  // button. MEASURED on 6 September: Highlightly, the only free source
  // that carries the Armenian league at all, has no top-scorers endpoint -
  // /top-scorers answers 404 - so from 23 September, when the paid plan
  // ends, the Armenian scoring chart has nowhere to come from. Hidden on
  // emptiness rather than on the country: nothing changes while the paid
  // provider still answers, and any league it stops answering for loses
  // the button by itself.
  const showToggle = Boolean(topScorerTables) && scorerRows.length > 0;
  // The league is switched with the toggle already open, and the new
  // league may have no scorers: fall back to the table rather than render
  // a panel whose button is no longer on the page.
  const view = showToggle ? mode : "standings";

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

      {view === "standings" ? (
        <div className="standings-scroll">
          <table className="standings-table">
            <thead><tr><th>#</th><th>Թիմ</th><th>Խ</th>{!compact ? <><th>Հ</th><th>Ո</th><th>Պ</th><th>ԳՏ</th></> : null}<th>Մ</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.team} className={cup ? "" : row.position <= 4 ? "zone-ucl" : row.position === 5 ? "zone-europa" : row.position > rows.length - 3 ? "zone-drop" : ""}>
                  <td><span className="position-marker">{row.position}</span></td>
                  <td>{(row.teamKey ?? row.teamId) ? (
                    <Link href={`/team/${row.teamKey ?? row.teamId}`} className="team-cell-link">
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
                      <Link href={`/player/${row.key ?? row.id}`} className="player-with-photo team-cell-link">
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

      {!compact && view === "standings" && !cup ? <div className="zone-legend"><span className="ucl">Չեմպիոնների լիգա</span><span className="europa">Եվրոպա լիգա</span><span className="drop">Իջեցման գոտի</span></div> : null}
    </div>
  );
}
