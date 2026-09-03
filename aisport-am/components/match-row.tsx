"use client";

import { sizedImage } from "../lib/image-proxy";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LiveMatch } from "../lib/live-football-server";

export function MatchRow({ match, date }: { match: LiveMatch; date: string }) {
  const router = useRouter();

  const openPopup = () => {
    router.push(`/live?date=${date}&match=${match.id}`, { scroll: false });
  };
  const stopAndGo = (event: React.MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <div
      className="match-row match-row-link"
      role="button"
      tabIndex={0}
      onClick={openPopup}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openPopup(); }}
    >
      <span className={match.isLive ? "match-live-status live-beacon-status" : ""}>{match.status}</span>
      {match.homeId ? (
        <Link href={`/team/${match.homeId}`} className="team-with-logo team-cell-link" onClick={stopAndGo}>
          {match.homeLogo && <img src={sizedImage(match.homeLogo, 24)} alt="" className="team-logo" loading="lazy" />}
          {match.home}
        </Link>
      ) : (
        <strong className="team-with-logo">{match.homeLogo && <img src={sizedImage(match.homeLogo, 24)} alt="" className="team-logo" loading="lazy" />}{match.home}</strong>
      )}
      <b className="score-big">{match.homeScore ?? "–"} : {match.awayScore ?? "–"}</b>
      {match.awayId ? (
        <Link href={`/team/${match.awayId}`} className="team-with-logo team-cell-link" onClick={stopAndGo}>
          {match.awayLogo && <img src={sizedImage(match.awayLogo, 24)} alt="" className="team-logo" loading="lazy" />}
          {match.away}
        </Link>
      ) : (
        <strong className="team-with-logo">{match.awayLogo && <img src={sizedImage(match.awayLogo, 24)} alt="" className="team-logo" loading="lazy" />}{match.away}</strong>
      )}
    </div>
  );
}
