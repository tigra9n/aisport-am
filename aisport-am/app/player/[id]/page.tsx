import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "../../../components/site-footer";
import { SiteHeader } from "../../../components/site-header";
import { getPlayerProfile, getPlayerTransfers } from "../../../lib/player-server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
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

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("hy-AM", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
  } catch {
    return value;
  }
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const playerId = Number.parseInt(id, 10);
  if (!Number.isFinite(playerId)) notFound();
  const [profile, transfers] = await Promise.all([getPlayerProfile(playerId), getPlayerTransfers(playerId)]);
  if (!profile) notFound();

  return <main><SiteHeader /><div className="site-shell inner-page">
    <span className="page-kicker">Խաղացողի պրոֆիլ</span>
    <div className="player-header">
      {profile.photo ? <img src={profile.photo} alt="" className="player-header-photo" loading="lazy" /> : <div className="player-header-photo squad-photo-placeholder">{profile.name.slice(0, 1)}</div>}
      <div>
        <h1 className="page-title">{profile.name}</h1>
        <div className="player-facts">
          {profile.currentTeam && <span>⚽ {profile.currentTeam}{profile.shirtNumber ? ` · #${profile.shirtNumber}` : ""}</span>}
          {profile.position && <span>📋 {POSITION_HY[profile.position] ?? profile.position}</span>}
          {profile.nationality && <span>🌍 {profile.nationality}</span>}
          {profile.birthDate && <span>🎂 {formatDate(profile.birthDate)}{profile.age ? ` (${profile.age} տ.)` : ""}{profile.birthPlace ? `, ${profile.birthPlace}` : ""}</span>}
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
                  <td><span className="team-with-logo">{row.leagueLogo && <img src={row.leagueLogo} alt="" className="team-logo" loading="lazy" />}{row.league}</span></td>
                  <td><span className="team-with-logo">{row.teamLogo && <img src={row.teamLogo} alt="" className="team-logo" loading="lazy" />}{row.team}</span></td>
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
              <span className="transfer-date">{formatDate(t.date)}</span>
              <span className="transfer-teams">
                <span className="team-with-logo">{t.teamOutLogo && <img src={t.teamOutLogo} alt="" className="team-logo" loading="lazy" />}{t.teamOut}</span>
                <span className="transfer-arrow">→</span>
                <span className="team-with-logo">{t.teamInLogo && <img src={t.teamInLogo} alt="" className="team-logo" loading="lazy" />}{t.teamIn}</span>
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
