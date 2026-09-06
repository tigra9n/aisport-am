import { sizedImage } from "../../../lib/image-proxy";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { SiteFooter } from "../../../components/site-footer";
import { SiteHeader } from "../../../components/site-header";
import { getCoach, getSquad, positionLabel, POSITION_ORDER } from "../../../lib/squad-server";
import { espnTwinUrl, knownTeam } from "../../../lib/entity-cache";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!isTeamId(id)) return {};
  const squad = await getSquad(teamId(id));
  if (!squad) return {};
  const description = `${squad.teamName}-ի կազմը, խաղացողները և մարզիչը։`;
  return {
    title: `${squad.teamName} — Կազմ | AIFootball.am`,
    description,
    alternates: { canonical: `https://aifootball.am/team/${id}` },
  };
}

// A club's number is now ESPN's, under an "espn-" prefix. Every URL Google
// indexed carries API-Football's bare number instead, so those are not
// broken and not kept: the old number is resolved to the club's name from
// the standings rows already in this site's own cache, that name is found
// among ESPN's clubs, and the reader is sent on with a 301. No table has to
// be maintained against two providers, and a number that resolves to
// nothing still renders the page it always did rather than a redirect to
// nowhere.
const isTeamId = (id: string) => id.startsWith("espn-") ? id.length > 5 : Number.isFinite(Number.parseInt(id, 10));
const teamId = (id: string) => id.startsWith("espn-") ? id : Number.parseInt(id, 10);

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isTeamId(id)) notFound();
  if (!id.startsWith("espn-")) {
    const moved = await espnTwinUrl(Number.parseInt(id, 10));
    if (moved) permanentRedirect(moved);
  }
  const [squad, coach] = await Promise.all([getSquad(teamId(id)), typeof teamId(id) === "number" ? getCoach(teamId(id) as number) : null]);

  // No squad is not the same as no team. The standings table already knows
  // this club - its name and badge are what the reader clicked on - so the
  // page is rendered with those rather than answering "does not exist",
  // which is what it used to do whenever the API was slow or a club simply
  // has no squad published. Only a team nothing knows about is a 404.
  if (!squad) {
    const known = typeof teamId(id) === "number" ? await knownTeam(teamId(id) as number) : null;
    if (!known) notFound();
    return <main><SiteHeader /><div className="site-shell inner-page">
      <span className="page-kicker">Ակումբի կազմ</span>
      <h1 className="page-title team-page-title">
        {known.logo && <img src={sizedImage(known.logo, 48)} alt="" className="team-logo-lg" loading="lazy" />}
        {known.name}
      </h1>
      <p className="detail-empty">Այս ակումբի կազմի տվյալները այս պահին հասանելի չեն։ Փորձիր մի փոքր ուշ։</p>
      <p className="page-intro"><Link href="/standings">Աղյուսակներ</Link> · <Link href="/live">Ուղիղ արդյունքներ</Link></p>
    </div><SiteFooter /></main>;
  }

  const groups = POSITION_ORDER.map((position) => ({
    position,
    players: squad.players.filter((p) => p.position === position),
  })).filter((g) => g.players.length > 0);
  const other = squad.players.filter((p) => !POSITION_ORDER.includes(p.position));

  return <main><SiteHeader /><div className="site-shell inner-page">
    <span className="page-kicker">Ակումբի կազմ</span>
    <h1 className="page-title team-page-title">
      {squad.teamLogo && <img src={sizedImage(squad.teamLogo, 48)} alt="" className="team-logo-lg" loading="lazy" />}
      {squad.teamName}
    </h1>
    <p className="page-intro">Ակումբի ամբողջական խաղացողների կազմը՝ ըստ դիրքի, համարով և տարիքով։ Սեղմիր խաղացողի վրա՝ պրոֆիլն ու տրանսֆերները տեսնելու համար։</p>
    {coach && (
      <Link href={`/coach/${coach.id}`} className="coach-card">
        {coach.photo ? <img src={sizedImage(coach.photo, 64)} alt="" className="squad-photo" loading="lazy" /> : <div className="squad-photo squad-photo-placeholder">{coach.name.slice(0, 1)}</div>}
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
              <Link href={`/player/${player.key ?? player.id}`} className="squad-card" key={player.key ?? player.id}>
                {player.photo ? <img src={sizedImage(player.photo, 64)} alt="" className="squad-photo" loading="lazy" /> : <div className="squad-photo squad-photo-placeholder">{player.name.slice(0, 1)}</div>}
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
              <Link href={`/player/${player.key ?? player.id}`} className="squad-card" key={player.key ?? player.id}>
                {player.photo ? <img src={sizedImage(player.photo, 64)} alt="" className="squad-photo" loading="lazy" /> : <div className="squad-photo squad-photo-placeholder">{player.name.slice(0, 1)}</div>}
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
