"use client";

import { useState } from "react";
import { leagues } from "../lib/football";
import type { TopScorer } from "../lib/topscorers-server";

export function TopScorersTabs({ tables }: { tables: Record<string, { rows: TopScorer[]; unavailable: boolean }> }) {
  const [active, setActive] = useState("PL");
  const selected = leagues.find((league) => league.code === active) ?? leagues[0];
  const data = tables[active];
  const rows = data?.rows ?? [];

  return (
    <div className="league-widget">
      <div className="league-select-shell">
        <label htmlFor="topscorer-select">Ընտրել առաջնությունը</label>
        <div className="league-select-wrap">
          <select id="topscorer-select" className="league-select" value={active} onChange={(event) => setActive(event.target.value)} aria-label="Ընտրել առաջնությունը">
            {leagues.map((league) => <option key={league.code} value={league.code}>{league.country} · {league.name}</option>)}
          </select>
          <span aria-hidden="true">⌄</span>
        </div>
      </div>
      <div className="table-title"><div><span>{selected.country}</span><strong>{selected.name}</strong></div>{rows.length === 0 ? <small>Տվյալ չկա</small> : <small className="live-data">Թարմացված</small>}</div>
      {rows.length > 0 ? (
        <div className="standings-scroll">
          <table className="standings-table topscorers-table">
            <thead><tr><th>#</th><th>Խաղացող</th><th>Թիմ</th><th>Խ</th><th>Ա</th><th>Գ</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name}>
                  <td><span className="position-marker">{row.rank}</span></td>
                  <td>
                    <span className="player-with-photo">
                      {row.photo && <img src={row.photo} alt="" className="player-photo" loading="lazy" />}
                      <strong>{row.name}</strong>
                    </span>
                  </td>
                  <td>
                    <span className="team-with-logo">
                      {row.teamLogo && <img src={row.teamLogo} alt="" className="team-logo" loading="lazy" />}
                      {row.team}
                    </span>
                  </td>
                  <td>{row.appearances}</td>
                  <td>{row.assists}</td>
                  <td><b>{row.goals}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="detail-empty">Տվյալները հասանելի չեն այս պահին։</p>
      )}
    </div>
  );
}
