import { sizedImage } from "../../../lib/image-proxy";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { SiteFooter } from "../../../components/site-footer";
import { SiteHeader } from "../../../components/site-header";
import { formatDateHy } from "../../../lib/format-date";
import { getCoachById } from "../../../lib/squad-server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const coachId = Number.parseInt(id, 10);
  if (!Number.isFinite(coachId)) return {};
  const coach = await getCoachById(coachId);
  if (!coach) return {};
  const description = `${coach.name}-ի մարզչական կարիերայի պատմությունը։`;
  return {
    title: `${coach.name} — Մարզիչ | AIFootball.am`,
    description,
    alternates: { canonical: `https://aifootball.am/coach/${id}` },
  };
}

function formatDate(value: string | null) {
  return value ? formatDateHy(value) : "մինչ օրս";
}

export default async function CoachPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const coachId = Number.parseInt(id, 10);
  if (!Number.isFinite(coachId)) notFound();
  const coach = await getCoachById(coachId);
  // No manager, but perhaps a forwarding address.
  //
  // This page has no free source and stops answering when the paid plan
  // ends on 23 September - ESPN publishes a manager who left the club
  // years ago, which is worse than nothing. So rather than a 404 on a
  // URL Google has indexed, the reader is sent to the club the manager
  // managed, which lib/coach-map.ts recorded while both were still
  // visible in one answer. The club page then forwards itself to the
  // free source. A manager with no row still gets the 404 he had.
  if (!coach) {
    const { clubOfCoach } = await import("../../../lib/coach-map");
    const club = clubOfCoach(coachId);
    if (club) {
      const { espnTeamFor } = await import("../../../lib/team-map");
      const { espnKey } = await import("../../../lib/espn");
      const twin = espnTeamFor(club);
      permanentRedirect(twin ? `/team/${espnKey(twin)}` : `/team/${club}`);
    }
    notFound();
  }

  return <main><SiteHeader /><div className="site-shell inner-page">
    <span className="page-kicker">Մարզչի պրոֆիլ</span>
    <div className="player-header">
      {coach.photo ? <img src={sizedImage(coach.photo, 128)} alt="" className="player-header-photo" loading="lazy" /> : <div className="player-header-photo squad-photo-placeholder">{coach.name.slice(0, 1)}</div>}
      <div>
        <h1 className="page-title">{coach.name}</h1>
        <div className="player-facts">
          {coach.nationality && <span>🌍 {coach.nationality}</span>}
          {coach.age && <span>🎂 {coach.age} տարեկան</span>}
        </div>
      </div>
    </div>

    <section className="transfers-section">
      <h2>Մարզչական կարիերա</h2>
      {coach.career.length > 0 ? (
        <div className="transfers-list">
          {coach.career.map((entry, index) => (
            <div className="transfer-row" key={index}>
              <span className="transfer-date">{formatDate(entry.start)} – {formatDate(entry.end)}</span>
              <span className="transfer-teams">
                <span className="team-with-logo">{entry.teamLogo && <img src={sizedImage(entry.teamLogo, 24)} alt="" className="team-logo" loading="lazy" />}{entry.team}</span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="detail-empty">Կարիերայի տվյալներ հասանելի չեն։</p>
      )}
    </section>
  </div><SiteFooter /></main>;
}
