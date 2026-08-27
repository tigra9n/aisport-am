import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "../../../components/site-footer";
import { SiteHeader } from "../../../components/site-header";
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
    title: `${coach.name} — Մարզիչ | AISport.am`,
    description,
    alternates: { canonical: `https://aisport.am/coach/${id}` },
  };
}

function formatDate(value: string | null) {
  if (!value) return "մինչ օրս";
  try {
    return new Intl.DateTimeFormat("hy-AM", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
  } catch {
    return value;
  }
}

export default async function CoachPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const coachId = Number.parseInt(id, 10);
  if (!Number.isFinite(coachId)) notFound();
  const coach = await getCoachById(coachId);
  if (!coach) notFound();

  return <main><SiteHeader /><div className="site-shell inner-page">
    <span className="page-kicker">Մարզչի պրոֆիլ</span>
    <div className="player-header">
      {coach.photo ? <img src={coach.photo} alt="" className="player-header-photo" loading="lazy" /> : <div className="player-header-photo squad-photo-placeholder">{coach.name.slice(0, 1)}</div>}
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
                <span className="team-with-logo">{entry.teamLogo && <img src={entry.teamLogo} alt="" className="team-logo" loading="lazy" />}{entry.team}</span>
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
