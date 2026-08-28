import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "../../../components/site-footer";
import { SiteHeader } from "../../../components/site-header";
import { getCoach, getSquad, positionLabel, POSITION_ORDER } from "../../../lib/squad-server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const teamId = Number.parseInt(id, 10);
  if (!Number.isFinite(teamId)) return {};
  const squad = await getSquad(teamId);
  if (!squad) return {};
  const description = `${squad.teamName}-ի կազմը, խաղացողները և մարզիչը։`;
  return {
    title: `${squad.teamName} — Կազմ | AIFootball.am`,
    description,
    alternates: { canonical: `https://aifootball.am/team/${id}` },
  };
}

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamId = Number.parseInt(id, 10);
  if (!Number.isFinite(teamId)) notFound();
  const [squad, coach] = await Promise.all([getSquad(teamId), getCoach(teamId)]);
  if (!squad) notFound();

  const groups = POSITION_ORDER.map((position) => ({
    position,
    players: squad.players.filter((p) => p.position === position),
  })).filter((g) => g.players.length > 0);
  const other = squad.players.filter((p) => !POSITION_ORDER.includes(p.position));

  return <main><SiteHeader /><div className="site-shell inner-page">
    <span className="page-kicker">Ակումբի կազմ</span>
    <h1 className="page-title team-page-title">
      {squad.teamLogo && <img src={squad.teamLogo} alt="" className="team-logo-lg" loading="lazy" />}
      {squad.teamName}
    </h1>
    <p className="page-intro">Ակումբի ամբողջական խաղացողների կազմը՝ ըստ դիրքի, համարով և տարիքով։ Սեղմիր խաղացողի վրա՝ պրոֆիլն ու տրանսֆերները տեսնելու համար։</p>
    {coach && (
      <Link href={`/coach/${coach.id}`} className="coach-card">
        {coach.photo ? <img src={coach.photo} alt="" className="squad-photo" loading="lazy" /> : <div className="squad-photo squad-photo-placeholder">{coach.name.slice(0, 1)}</div>}
        <div>
          <span>Գլխավոր մարզիչ</span>
          <strong>{coach.name}</strong>
          <small>{coach.nationality ?? ""}{coach.age ? ` · ${coach.age} տարեկան` : ""}</small>
        </div>
      </Link>
    )}
    <div className="squad-groups">
      {groups.map((group) => (
        <section className="squad-group" key={group.position}>
          <h2>{positionLabel(group.position)}</h2>
          <div className="squad-grid">
            {group.players.map((player) => (
              <Link href={`/player/${player.id}`} className="squad-card" key={player.id}>
                {player.photo ? <img src={player.photo} alt="" className="squad-photo" loading="lazy" /> : <div className="squad-photo squad-photo-placeholder">{player.name.slice(0, 1)}</div>}
                <div>
                  <strong>{player.name}</strong>
                  <span>{player.number ? `#${player.number}` : "—"}{player.age ? ` · ${player.age} տարեկան` : ""}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
      {other.length > 0 && (
        <section className="squad-group">
          <h2>Այլ</h2>
          <div className="squad-grid">
            {other.map((player) => (
              <Link href={`/player/${player.id}`} className="squad-card" key={player.id}>
                {player.photo ? <img src={player.photo} alt="" className="squad-photo" loading="lazy" /> : <div className="squad-photo squad-photo-placeholder">{player.name.slice(0, 1)}</div>}
                <div>
                  <strong>{player.name}</strong>
                  <span>{player.number ? `#${player.number}` : "—"}{player.age ? ` · ${player.age} տարեկան` : ""}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  </div><SiteFooter /></main>;
}
