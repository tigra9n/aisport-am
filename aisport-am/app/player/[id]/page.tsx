import { sizedImage } from "../../../lib/image-proxy";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "../../../components/site-footer";
import { SiteHeader } from "../../../components/site-header";
import { formatDateHy } from "../../../lib/format-date";
import { getPlayerProfile, getPlayerTransfers } from "../../../lib/player-server";
import { knownPlayer } from "../../../lib/entity-cache";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (id.startsWith("espn-")) {
    const { espnPlayer } = await import("../../../lib/espn");
    const player = await espnPlayer(id.slice(5));
    if (!player) return {};
    return {
      title: `${player.name} — Խաղացողի պրոֆիլ | AIFootball.am`,
      description: `${player.name}-ի պրոֆիլը, մրցաշրջանների վիճակագրությունը և ակումբները։`,
      alternates: { canonical: `https://aifootball.am/player/${id}` },
    };
  }
  const playerId = Number.parseInt(id, 10);
  if (!Number.isFinite(playerId)) return {};
  const profile = await getPlayerProfile(playerId);
  if (!profile) return {};
  const description = `${profile.name}-ի պրոֆիլը, վիճակագրություն և կարիերայի պատմություն։`;
  return {
    title: `${profile.name} — Խաղացողի պրոֆիլ | AIFootball.am`,
    description,
    alternates: { canonical: `https://aifootball.am/player/${id}` },
  };
}

// API-Football reports the position in English; these are the four values it
// uses, and anything unrecognised is shown as received rather than dropped.
const POSITION_HY: Record<string, string> = {
  Goalkeeper: "Դարպասապահ",
  Defender: "Պաշտպան",
  Midfielder: "Կիսապաշտպան",
  Attacker: "Հարձակվող",
};

// ESPN's numbering, under its own prefix, the same as the club pages. The
// squads and the scoring charts link this way now; the bare numbers below
// are API-Football's and are what Google indexed, so both are served.
async function EspnPlayerPage({ id }: { id: string }) {
  const { espnPlayer } = await import("../../../lib/espn");
  const player = await espnPlayer(id.slice(5));
  if (!player) notFound();
  return <main><SiteHeader /><div className="site-shell inner-page">
    <span className="page-kicker">Խաղացողի պրոֆիլ</span>
    <div className="player-header">
      {player.photo ? <img src={sizedImage(player.photo, 128)} alt="" className="player-header-photo" loading="lazy" /> : <div className="player-header-photo squad-photo-placeholder">{player.name.slice(0, 1)}</div>}
      <div>
        <h1 className="page-title">{player.name}</h1>
        <div className="player-facts">
          {player.currentTeam && <span>⚽ {player.currentTeamKey ? <Link href={`/team/${player.currentTeamKey}`}>{player.currentTeam}</Link> : player.currentTeam}{player.shirtNumber ? ` · #${player.shirtNumber}` : ""}</span>}
          {player.position && <span>📋 {POSITION_HY[player.position] ?? player.position}</span>}
          {player.nationality && <span>🌍 {player.nationality}</span>}
          {player.birthDate && <span>🎂 {formatDateHy(player.birthDate)}{player.age ? ` (${player.age} տ.)` : ""}{player.birthPlace ? `, ${player.birthPlace}` : ""}</span>}
          {player.height && <span>📏 {player.height}</span>}
          {player.weight && <span>⚖️ {player.weight}</span>}
        </div>
      </div>
    </div>

    {/* One table per season and competition, with the provider's own
        columns rather than a fixed six: a goalkeeper's saves and a
        striker's shots both survive, and the column keeps the written
        description the provider gives it as its tooltip. */}
    {player.seasons.length > 0 ? player.seasons.map((season, index) => (
      <section className="transfers-section" key={`${season.season}-${season.league}-${index}`}>
        <h2>
          {season.season}{season.league ? ` · ${season.league}` : ""}{season.team ? ` · ${season.team}` : ""}
        </h2>
        <div className="standings-scroll">
          <table className="standings-table">
            <thead><tr>{season.columns.map((column) => <th key={column.label} title={column.note ?? undefined}>{column.label}</th>)}</tr></thead>
            <tbody><tr>{season.columns.map((column) => <td key={column.label}>{column.value}</td>)}</tr></tbody>
          </table>
        </div>
      </section>
    )) : <p className="detail-empty">Այս խաղացողի վիճակագրությունը այս պահին հասանելի չէ։</p>}

    {player.clubs.length > 0 && (
      <section className="transfers-section">
        <h2>Ակումբները</h2>
        <div className="subs-grid">
          {player.clubs.map((club) => <span className="subs-chip" key={club}>{club}</span>)}
        </div>
      </section>
    )}
  </div><SiteFooter /></main>;
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id.startsWith("espn-")) return EspnPlayerPage({ id });
  const playerId = Number.parseInt(id, 10);
  if (!Number.isFinite(playerId)) notFound();
  const [profile, transfers] = await Promise.all([getPlayerProfile(playerId), getPlayerTransfers(playerId)]);

  // Same rule as the team page: a player the top-scorer table already knows
  // gets a page carrying the name the reader clicked on, not a 404. The
  // 404s Google recorded here were the API being slow on a first visit, not
  // pages that were missing.
  if (!profile) {
    const known = await knownPlayer(playerId);
    if (!known) notFound();
    return <main><SiteHeader /><div className="site-shell inner-page">
      <span className="page-kicker">Խաղացողի պրոֆիլ</span>
      <div className="player-header">
        {known.photo ? <img src={sizedImage(known.photo, 128)} alt="" className="player-header-photo" loading="lazy" /> : <div className="player-header-photo squad-photo-placeholder">{known.name.slice(0, 1)}</div>}
        <div>
          <h1 className="page-title">{known.name}</h1>
          <div className="player-facts">{known.team && <span>⚽ {known.team}</span>}</div>
        </div>
      </div>
      <p className="detail-empty">Այս խաղացողի մանրամասն վիճակագրությունը այս պահին հասանելի չէ։ Փորձիր մի փոքր ուշ։</p>
    </div><SiteFooter /></main>;
  }

  return <main><SiteHeader /><div className="site-shell inner-page">
    <span className="page-kicker">Խաղացողի պրոֆիլ</span>
    <div className="player-header">
      {profile.photo ? <img src={sizedImage(profile.photo, 128)} alt="" className="player-header-photo" loading="lazy" /> : <div className="player-header-photo squad-photo-placeholder">{profile.name.slice(0, 1)}</div>}
      <div>
        <h1 className="page-title">{profile.name}</h1>
        <div className="player-facts">
          {profile.currentTeam && <span>⚽ {profile.currentTeam}{profile.shirtNumber ? ` · #${profile.shirtNumber}` : ""}</span>}
          {profile.position && <span>📋 {POSITION_HY[profile.position] ?? profile.position}</span>}
          {profile.nationality && <span>🌍 {profile.nationality}</span>}
          {profile.birthDate && <span>🎂 {formatDateHy(profile.birthDate)}{profile.age ? ` (${profile.age} տ.)` : ""}{profile.birthPlace ? `, ${profile.birthPlace}` : ""}</span>}
          {profile.height && <span>📏 {profile.height}</span>}
          {profile.weight && <span>⚖️ {profile.weight}</span>}
        </div>
      </div>
    </div>

    {profile.statistics.length > 0 ? (
      <section className="transfers-section">
        <h2>{profile.season}/{String(profile.season + 1).slice(2)} մրցաշրջանի վիճակագրություն</h2>
        {/* Wrapped in .standings-scroll like every other table on the site:
            without it the table widens the whole document on a phone, which
            is exactly the defect just fixed on the category pages. */}
        <div className="standings-scroll">
          <table className="standings-table">
            <thead><tr>
              <th>Մրցաշար</th><th>Թիմ</th><th>Խաղ</th><th>Րոպե</th><th>Գոլ</th><th>Փոխ.</th><th>ԴՔ</th><th>ԿՔ</th><th>Ռեյտ.</th>
            </tr></thead>
            <tbody>
              {profile.statistics.map((row, index) => (
                <tr key={index}>
                  <td><span className="team-with-logo">{row.leagueLogo && <img src={sizedImage(row.leagueLogo, 24)} alt="" className="team-logo" loading="lazy" />}{row.league}</span></td>
                  <td><span className="team-with-logo">{row.teamLogo && <img src={sizedImage(row.teamLogo, 24)} alt="" className="team-logo" loading="lazy" />}{row.team}</span></td>
                  <td>{row.appearances}</td>
                  <td>{row.minutes}</td>
                  <td>{row.goals}</td>
                  <td>{row.assists}</td>
                  <td>{row.yellow}</td>
                  <td>{row.red}</td>
                  <td>{row.rating ?? "—"}</td>
                </tr>
              ))}
              {profile.statistics.length > 1 ? (
                <tr className="stats-total">
                  <td colSpan={2}>Ընդամենը</td>
                  <td>{profile.statistics.reduce((n, r) => n + r.appearances, 0)}</td>
                  <td>{profile.statistics.reduce((n, r) => n + r.minutes, 0)}</td>
                  <td>{profile.statistics.reduce((n, r) => n + r.goals, 0)}</td>
                  <td>{profile.statistics.reduce((n, r) => n + r.assists, 0)}</td>
                  <td>{profile.statistics.reduce((n, r) => n + r.yellow, 0)}</td>
                  <td>{profile.statistics.reduce((n, r) => n + r.red, 0)}</td>
                  <td>—</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    ) : null}

    <section className="transfers-section">
      <h2>Տրանսֆերների պատմություն</h2>
      {transfers.length > 0 ? (
        <div className="transfers-list">
          {transfers.map((t, index) => (
            <div className="transfer-row" key={index}>
              <span className="transfer-date">{formatDateHy(t.date)}</span>
              <span className="transfer-teams">
                <span className="team-with-logo">{t.teamOutLogo && <img src={sizedImage(t.teamOutLogo, 24)} alt="" className="team-logo" loading="lazy" />}{t.teamOut}</span>
                <span className="transfer-arrow">→</span>
                <span className="team-with-logo">{t.teamInLogo && <img src={sizedImage(t.teamInLogo, 24)} alt="" className="team-logo" loading="lazy" />}{t.teamIn}</span>
              </span>
              {t.type && <span className="transfer-type">{t.type}</span>}
            </div>
          ))}
        </div>
      ) : (
        <p className="detail-empty">Տրանսֆերների տվյալներ հասանելի չեն։</p>
      )}
    </section>
  </div><SiteFooter /></main>;
}
