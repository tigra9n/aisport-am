"use client";

import { useState } from "react";
import { leagues, type StandingRow } from "../lib/football";

export function LeagueTabs({ tables, compact = false }: { tables: Record<string, { rows: StandingRow[]; demo: boolean }>; compact?: boolean }) {
  const [active, setActive] = useState("PL");
  const selected = leagues.find((league) => league.code === active) ?? leagues[0];
  const data = tables[active];
  const rows = data?.rows ?? [];

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
      <div className="table-title"><div><span>{selected.country}</span><strong>{selected.name}</strong></div>{data?.demo ? <small>Դեմո տվյալներ</small> : <small className="live-data">Թարմացված</small>}</div>
      <div className="standings-scroll">
        <table className="standings-table">
          <thead><tr><th>#</th><th>Թիմ</th><th>Խ</th>{!compact ? <><th>Հ</th><th>Ո</th><th>Պ</th><th>ԳՏ</th></> : null}<th>Մ</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.team} className={row.position <= 4 ? "zone-ucl" : row.position === 5 ? "zone-europa" : row.position > rows.length - 3 ? "zone-drop" : ""}><td><span className="position-marker">{row.position}</span></td><td><span className="team-badge">{row.team.slice(0, 1)}</span><strong>{row.team}</strong></td><td>{row.played}</td>{!compact ? <><td>{row.won}</td><td>{row.draw}</td><td>{row.lost}</td><td>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td></> : null}<td><b>{row.points}</b></td></tr>)}</tbody>
        </table>
      </div>
      {!compact ? <div className="zone-legend"><span className="ucl">Չեմպիոնների լիգա</span><span className="europa">Եվրոպա լիգա</span><span className="drop">Իջեցման գոտի</span></div> : null}
    </div>
  );
}
