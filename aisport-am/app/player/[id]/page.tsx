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
    title: `${profile.name} — Խաղացողի պրոֆիլ | AISport.am`,
    description,
    alternates: { canonical: `https://aisport.am/player/${id}` },
  };
}

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
          {profile.nationality && <span>🌍 {profile.nationality}</span>}
          {profile.birthDate && <span>🎂 {formatDate(profile.birthDate)}{profile.birthPlace ? `, ${profile.birthPlace}` : ""}</span>}
          {profile.height && <span>📏 {profile.height}</span>}
          {profile.weight && <span>⚖️ {profile.weight}</span>}
        </div>
      </div>
    </div>

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
