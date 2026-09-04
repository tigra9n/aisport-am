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
      onClick={openPopup}
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
      {/* The row was a button with two team links inside it - one control
          wrapping others, which axe reports and a screen reader cannot make
          sense of. The row still opens the match for a mouse, but the score
          is now the actual control, so the keyboard has one thing to press
          rather than a box that swallows what it contains. */}
      <button
        type="button"
        className="score-big score-open"
        onClick={(event) => { event.stopPropagation(); openPopup(); }}
        aria-label={`Բացել մանրամասները՝ ${match.home} ${match.homeScore ?? "–"} : ${match.awayScore ?? "–"} ${match.away}`}
      >{match.homeScore ?? "–"} : {match.awayScore ?? "–"}</button>
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
